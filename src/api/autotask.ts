/**
 * @fileoverview Autotask REST API client for ticket and resource management.
 * Provides functions to create tickets, retrieve ticket details, and look up
 * resource (technician) information for call transfers.
 * @module api/autotask
 */
import https from 'https'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

/**
 * Parameters for creating a new Autotask ticket.
 * 
 * @interface CreateTicketParams
 * @property {number} companyId - Autotask company ID the ticket belongs to
 * @property {number} queueId - Queue ID for ticket routing to the appropriate team
 * @property {string} contactName - Name of the person reporting the issue
 * @property {string} [contactPhone] - Contact's phone number
 * @property {string} [contactEmail] - Contact's email address
 * @property {string} issueDescription - Detailed description of the issue or request
 * @property {'phone'|'email'} preferredContactMethod - How the contact prefers to be reached
 * @property {string} title - Brief title/summary for the ticket
 * @property {'1'|'2'} ticketType - '1' for Service Request, '2' for Incident
 * @property {'4'|'1'|'2'|'5'} priority - Priority: 4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low
 * @property {string} externalID - External reference ID (e.g., Retell call ID)
 */
export interface CreateTicketParams {
	companyId: number
	queueId: number
	contactName: string
	contactPhone?: string
	contactEmail?: string
	issueDescription: string
	preferredContactMethod: 'phone' | 'email'
	title: string
	ticketType: '1' | '2'
	priority: '4' | '1' | '2' | '5'
	externalID: string
}

/**
 * Response from the Autotask ticket creation API.
 * 
 * @interface AutotaskTicketResponse
 * @property {string} [itemId] - The created ticket's ID (direct property)
 * @property {Object} [item] - Nested item object containing the ticket
 * @property {string} [item.id] - The created ticket's ID (nested)
 */
export interface AutotaskTicketResponse {
	itemId?: string
	item?: {
		id: string
	}
}

/**
 * Detailed ticket information returned from Autotask.
 * 
 * @interface TicketDetails
 * @property {string} id - Unique ticket identifier
 * @property {string} ticketNumber - Human-readable ticket number (e.g., 'T20240101.0001')
 * @property {string} [assignedResourceID] - ID of the assigned technician, if any
 * @property {string} title - Ticket title/summary
 * @property {number} status - Ticket status code
 * @property {number} priority - Ticket priority code
 */
export interface TicketDetails {
	id: string
	ticketNumber: string
	assignedResourceID?: string
	title: string
	status: number
	priority: number
}

/**
 * Generic response wrapper for Autotask query endpoints.
 * 
 * @interface AutotaskQueryResponse
 * @template T - The type of items returned
 * @property {T[]} items - Array of returned items
 * @property {Object} [pageDetails] - Pagination information
 * @property {number} [pageDetails.count] - Total count of matching items
 * @property {number} [pageDetails.requestCount] - Number of items in this response
 */
export interface AutotaskQueryResponse<T> {
	items: T[]
	pageDetails?: {
		count: number
		requestCount: number
	}
}

/**
 * Resource (technician/employee) information from Autotask.
 * Used for call transfer functionality when a ticket is assigned.
 * 
 * @interface ResourceDetails
 * @property {string} id - Unique resource identifier
 * @property {string} firstName - Resource's first name
 * @property {string} lastName - Resource's last name
 * @property {string} [email] - Resource's email address
 * @property {string} [officePhone] - Office phone number
 * @property {string} [mobilePhone] - Mobile phone number (preferred for transfers)
 * @property {string} [homePhone] - Home phone number
 * @property {string} [officeExtension] - Office phone extension
 */
export interface ResourceDetails {
	id: string
	firstName: string
	lastName: string
	email?: string
	officePhone?: string
	mobilePhone?: string
	homePhone?: string
	officeExtension?: string
}

/**
 * Simple rate limiter to prevent overwhelming the Autotask API.
 * Enforces a minimum interval between consecutive API calls.
 * 
 * @class RateLimiter
 * @private
 */
class RateLimiter {
	/** Timestamp of the last API call */
	private lastCallTime = 0
	/** Minimum milliseconds between API calls */
	private readonly minInterval = 10

	/**
	 * Waits if necessary to respect the rate limit before making an API call.
	 * @returns {Promise<void>} Resolves when it's safe to make the next call
	 */
	async waitForTurn(): Promise<void> {
		const now = Date.now()
		const timeSinceLastCall = now - this.lastCallTime

		if (timeSinceLastCall < this.minInterval) {
			const waitTime = this.minInterval - timeSinceLastCall
			logger.debug({ waitTime }, 'Rate limiting Autotask API call')
			await new Promise((resolve) => setTimeout(resolve, waitTime))
		}

		this.lastCallTime = Date.now()
	}
}

/**
 * Singleton rate limiter instance for all Autotask API calls.
 * @const {RateLimiter}
 * @private
 */
const rateLimiter = new RateLimiter()

/**
 * Creates a new ticket in Autotask.
 * 
 * Constructs the ticket payload with contact information, description,
 * and routing details, then submits it to the Autotask REST API.
 * 
 * @async
 * @function createTicket
 * @param {CreateTicketParams} params - Ticket creation parameters
 * @returns {Promise<AutotaskTicketResponse>} The created ticket response with itemId
 * @throws {Error} If the API returns an error status or invalid response
 * 
 * @example
 * ```typescript
 * const result = await createTicket({
 *   companyId: 12345,
 *   queueId: 67890,
 *   contactName: 'John Doe',
 *   contactPhone: '555-1234',
 *   issueDescription: 'Cannot print',
 *   preferredContactMethod: 'phone',
 *   title: 'Printer Issue',
 *   ticketType: '2',
 *   priority: '2',
 *   externalID: 'retell-abc123'
 * })
 * console.log(`Created ticket: ${result.itemId}`)
 * ```
 */
export async function createTicket(params: CreateTicketParams): Promise<AutotaskTicketResponse> {
	// Rate limit API calls
	await rateLimiter.waitForTurn()

	logger.info({ externalID: params.externalID, companyId: params.companyId, queueId: params.queueId }, 'Calling Autotask API')

	const description = `Contact: ${params.contactName}
${params.contactPhone ? `Phone: ${params.contactPhone}` : ''}
${params.contactEmail ? `Email: ${params.contactEmail}` : ''}
${params.preferredContactMethod ? `Preferred Contact Method: ${params.preferredContactMethod}` : ''}

${params.issueDescription}`

	const ticketPayload = {
		companyID: params.companyId,
		title: params.title.trim(),
		description: description.trim(),
		priority: parseInt(params.priority),
		status: 1,
		ticketType: parseInt(params.ticketType),
		preferredContactMethod: params.preferredContactMethod,
		source: 2, // Phone
		queueID: params.queueId,
		externalID: params.externalID
	}

	const postData = JSON.stringify(ticketPayload)

	const options = {
		hostname: config.autotask.hostname,
		path: '/ATServicesRest/V1.0/Tickets/',
		method: 'POST',
		headers: {
			Host: config.autotask.hostname,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(postData),
			'User-Agent': 'Node.js',
			ApiIntegrationCode: config.autotask.apiIntegrationCode,
			UserName: config.autotask.username,
			Secret: config.autotask.secret
		}
	}

	return new Promise<AutotaskTicketResponse>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode }, 'Autotask API response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (!responseData || responseData.trim() === '') {
					return reject(new Error(`Autotask returned empty response (HTTP ${res.statusCode})`))
				}

				try {
					const data = JSON.parse(responseData)

					if (res.statusCode !== 200 && res.statusCode !== 201) {
						logger.error({ statusCode: res.statusCode, response: data }, 'Autotask API error')
						return reject(
							new Error(`Failed to create ticket: ${res.statusCode} - ${JSON.stringify(data)}`)
						)
					}

					logger.info({ ticketId: data.itemId || data.item?.id }, 'Ticket created successfully')
					resolve(data)
				} catch (e) {
					logger.error(
						{ error: e, response: responseData.substring(0, 200) },
						'Invalid JSON from Autotask'
					)
					reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`))
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Autotask API request error')
			reject(error)
		})

		req.write(postData)
		req.end()
	})
}

/**
 * Retrieves detailed ticket information from Autotask by ticket ID.
 * 
 * Used to get the ticket number and assigned resource after creation.
 * 
 * @async
 * @function getTicketById
 * @param {string} ticketId - The Autotask ticket ID to retrieve
 * @returns {Promise<TicketDetails>} Ticket details including number and assignment
 * @throws {Error} If the ticket is not found or API returns an error
 * 
 * @example
 * ```typescript
 * const ticket = await getTicketById('123456')
 * console.log(`Ticket ${ticket.ticketNumber} assigned to ${ticket.assignedResourceID}`)
 * ```
 */
export async function getTicketById(ticketId: string): Promise<TicketDetails> {
	// Rate limit API calls
	await rateLimiter.waitForTurn()

	logger.info({ ticketId }, 'Getting ticket details from Autotask')

	const options = {
		hostname: config.autotask.hostname,
		path: `/ATServicesRest/V1.0/Tickets/${ticketId}`,
		method: 'GET',
		headers: {
			Host: config.autotask.hostname,
			Accept: 'application/json',
			'User-Agent': 'Node.js',
			ApiIntegrationCode: config.autotask.apiIntegrationCode,
			UserName: config.autotask.username,
			Secret: config.autotask.secret
		}
	}

	return new Promise<TicketDetails>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode, ticketId }, 'Get ticket response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (!responseData || responseData.trim() === '') {
					return reject(new Error(`Autotask returned empty response (HTTP ${res.statusCode})`))
				}

				try {
					const data = JSON.parse(responseData)

					if (res.statusCode !== 200) {
						logger.error({ statusCode: res.statusCode, response: data }, 'Get ticket API error')
						return reject(
							new Error(`Failed to get ticket: ${res.statusCode} - ${JSON.stringify(data)}`)
						)
					}

					const ticket = data.item
					if (!ticket) {
						return reject(new Error('No ticket data returned'))
					}

					logger.info({ ticketId, ticketNumber: ticket.ticketNumber }, 'Ticket retrieved successfully')
					resolve({
						id: ticket.id,
						ticketNumber: ticket.ticketNumber,
						assignedResourceID: ticket.assignedResourceID,
						title: ticket.title,
						status: ticket.status,
						priority: ticket.priority
					})
				} catch (e) {
					logger.error(
						{ error: e, response: responseData.substring(0, 200) },
						'Invalid JSON from Autotask'
					)
					reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`))
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Get ticket API request error')
			reject(error)
		})

		req.end()
	})
}

/**
 * Retrieves resource (technician) details from Autotask by resource ID.
 * 
 * Used to get contact information for call transfers when a ticket
 * is assigned to a specific technician.
 * 
 * @async
 * @function getResourceById
 * @param {string} resourceId - The Autotask resource ID to retrieve
 * @returns {Promise<ResourceDetails>} Resource details including phone numbers
 * @throws {Error} If the resource is not found or API returns an error
 * 
 * @example
 * ```typescript
 * const resource = await getResourceById('789')
 * const transferPhone = resource.mobilePhone || resource.officePhone
 * console.log(`Transfer to ${resource.firstName} at ${transferPhone}`)
 * ```
 */
export async function getResourceById(resourceId: string): Promise<ResourceDetails> {
	// Rate limit API calls
	await rateLimiter.waitForTurn()

	logger.info({ resourceId }, 'Getting resource details from Autotask')

	const options = {
		hostname: config.autotask.hostname,
		path: `/ATServicesRest/V1.0/Resources/${resourceId}`,
		method: 'GET',
		headers: {
			Host: config.autotask.hostname,
			Accept: 'application/json',
			'User-Agent': 'Node.js',
			ApiIntegrationCode: config.autotask.apiIntegrationCode,
			UserName: config.autotask.username,
			Secret: config.autotask.secret
		}
	}

	return new Promise<ResourceDetails>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode, resourceId }, 'Get resource response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (!responseData || responseData.trim() === '') {
					return reject(new Error(`Autotask returned empty response (HTTP ${res.statusCode})`))
				}

				try {
					const data = JSON.parse(responseData)

					if (res.statusCode !== 200) {
						logger.error({ statusCode: res.statusCode, response: data }, 'Get resource API error')
						return reject(
							new Error(`Failed to get resource: ${res.statusCode} - ${JSON.stringify(data)}`)
						)
					}

					const resource = data.item
					if (!resource) {
						return reject(new Error('No resource data returned'))
					}

					logger.info(
						{ resourceId, name: `${resource.firstName} ${resource.lastName}` },
						'Resource retrieved successfully'
					)
					resolve({
						id: resource.id,
						firstName: resource.firstName,
						lastName: resource.lastName,
						email: resource.email,
						officePhone: resource.officePhone,
						mobilePhone: resource.mobilePhone,
						homePhone: resource.homePhone,
						officeExtension: resource.officeExtension
					})
				} catch (e) {
					logger.error(
						{ error: e, response: responseData.substring(0, 200) },
						'Invalid JSON from Autotask'
					)
					reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`))
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Get resource API request error')
			reject(error)
		})

		req.end()
	})
}
