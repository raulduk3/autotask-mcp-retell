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
 */
export interface CreateTicketParams {
	/** Autotask company ID the ticket belongs to */
	companyId: number
	/** Autotask contact ID to associate with the ticket */
	contactId?: number
	/** Queue ID for ticket routing to the appropriate team */
	queueId?: number
	/** Name of the person reporting the issue */
	contactName: string
	/** Contact's phone number */
	contactPhone?: string
	/** Contact's email address */
	contactEmail?: string
	/** Detailed description of the issue or request */
	issueDescription: string
	/** How the contact prefers to be reached */
	preferredContactMethod: 'phone' | 'email'
	/** Brief title/summary for the ticket */
	title: string
	/** Ticket type: '1' for Service Request, '2' for Incident */
	ticketType: '1' | '2'
	/** Priority: '4'=P1 Critical, '1'=P2 High, '2'=P3 Medium, '5'=P4 Low */
	priority: '4' | '1' | '2' | '5'
	/** External reference ID (e.g., Retell call ID) */
	externalID: string
}

/**
 * Response from the Autotask ticket creation API.
 */
export interface AutotaskTicketResponse {
	/** The created ticket's ID (direct property) */
	itemId?: string
	/** Nested item object containing the ticket */
	item?: {
		/** The created ticket's ID (nested) */
		id: string
	}
}

/**
 * Detailed ticket information returned from Autotask.
 */
export interface TicketDetails {
	/** Unique ticket identifier */
	id: string
	/** Human-readable ticket number (e.g., 'T20240101.0001') */
	ticketNumber: string
	/** ID of the assigned technician, if any */
	assignedResourceID?: string
	/** Ticket title/summary */
	title: string
	/** Ticket status code */
	status: number
	/** Ticket priority code */
	priority: number
}

/**
 * Generic response wrapper for Autotask query endpoints.
 * @typeParam T - The type of items returned
 */
export interface AutotaskQueryResponse<T> {
	/** Array of returned items */
	items: T[]
	/** Pagination information */
	pageDetails?: {
		/** Total count of matching items */
		count: number
		/** Number of items in this response */
		requestCount: number
	}
}

/**
 * Resource (technician/employee) information from Autotask.
 * Used for call transfer functionality when a ticket is assigned.
 */
export interface ResourceDetails {
	/** Unique resource identifier */
	id: string
	/** Resource's first name */
	firstName: string
	/** Resource's last name */
	lastName: string
	/** Resource's email address */
	email?: string
	/** Office phone number */
	officePhone?: string
	/** Mobile phone number (preferred for transfers) */
	mobilePhone?: string
	/** Home phone number */
	homePhone?: string
	/** Office phone extension */
	officeExtension?: string
}

/**
 * Company (organization) information from Autotask.
 */
export interface CompanyDetails {
	/** Unique company identifier */
	id: number
	/** Organization name */
	companyName: string
	/** Primary phone number */
	phone?: string
	/** Whether the company is active */
	isActive: boolean
}

/**
 * Contact information from Autotask.
 */
export interface ContactDetails {
	/** Unique contact identifier */
	id: number
	/** Associated company ID */
	companyID: number
	/** Contact's first name */
	firstName: string
	/** Contact's last name */
	lastName: string
	/** Primary email address */
	emailAddress?: string
	/** Primary phone number */
	phone?: string
	/** Mobile phone number */
	mobilePhone?: string
	/** Whether the contact is active */
	isActive: boolean
}

/**
 * Simple rate limiter to prevent overwhelming the Autotask API.
 * Enforces a minimum interval between consecutive API calls.
 * 
 * @internal
 */
class RateLimiter {
	/** Timestamp of the last API call */
	private lastCallTime = 0
	/** Minimum milliseconds between API calls */
	private readonly minInterval = 10

	/**
	 * Waits if necessary to respect the rate limit before making an API call.
	 * Resolves when it's safe to make the next call.
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
 * @internal
 */
const rateLimiter = new RateLimiter()

/**
 * Cached default queue ID to avoid repeated API calls.
 * @private
 */
let cachedDefaultQueueId: number | null = null

/**
 * Field information from Autotask entity metadata.
 * @internal
 */
interface FieldInfo {
	/** Field name (e.g., 'queueID') */
	name: string
	/** Whether field is a picklist */
	isPickList: boolean
	/** Available options for picklist fields */
	picklistValues?: Array<{
		value: string
		label: string
		isDefaultValue: boolean
		isActive: boolean
	}>
}

/**
 * Retrieves the default queue ID from Autotask Ticket field metadata.
 * Caches the result to avoid repeated API calls.
 * 
 * @returns The default queue ID, or null if not found
 */
export async function getDefaultQueueId(): Promise<number | null> {
	if (cachedDefaultQueueId !== null) {
		logger.debug({ cachedDefaultQueueId }, 'Using cached default queue ID')
		return cachedDefaultQueueId
	}

	await rateLimiter.waitForTurn()
	logger.info('Fetching Ticket field info for default queue ID')

	const options = {
		hostname: config.autotask.hostname,
		path: '/ATServicesRest/V1.0/Tickets/entityInformation/fields',
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

	return new Promise<number | null>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode }, 'Get field info response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (!responseData || responseData.trim() === '') {
					logger.warn('Empty response from field info API')
					return resolve(null)
				}

				try {
					const data = JSON.parse(responseData)

					if (res.statusCode !== 200) {
						logger.error({ statusCode: res.statusCode, response: data }, 'Get field info API error')
						return resolve(null)
					}

					const fields: FieldInfo[] = data.fields || []
					const queueField = fields.find((f: FieldInfo) => f.name === 'queueID')

					if (!queueField || !queueField.picklistValues) {
						logger.warn('queueID field not found or has no picklist values')
						return resolve(null)
					}

					const defaultQueue = queueField.picklistValues.find(
						(pv) => pv.isDefaultValue && pv.isActive
					)

					if (defaultQueue) {
						cachedDefaultQueueId = parseInt(defaultQueue.value)
						logger.info({ defaultQueueId: cachedDefaultQueueId, label: defaultQueue.label }, 'Found default queue ID')
						return resolve(cachedDefaultQueueId)
					}

					logger.warn('No default queue found in picklist values')
					return resolve(null)
				} catch (e) {
					logger.error({ error: e }, 'Failed to parse field info response')
					return resolve(null)
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Get field info API request error')
			resolve(null)
		})

		req.end()
	})
}

/**
 * Creates a new ticket in Autotask.
 * 
 * Constructs the ticket payload with contact information, description,
 * and routing details, then submits it to the Autotask REST API.
 * 
 * @param params - Ticket creation parameters
 * @returns The created ticket response with itemId
 * @throws Error if the API returns an error status or invalid response
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
	// Get default queue ID if not provided
	let queueId = params.queueId
	if (!queueId) {
		const defaultQueueId = await getDefaultQueueId()
		if (defaultQueueId) {
			queueId = defaultQueueId
		}
	}

	// Rate limit API calls
	await rateLimiter.waitForTurn()

	logger.info({ externalID: params.externalID, companyId: params.companyId, contactId: params.contactId, queueId }, 'Calling Autotask API')

	// Build description with preferred contact method
	const description = `${params.issueDescription.trim()}

Preferred Contact Method: ${params.preferredContactMethod}`

	const ticketPayload: Record<string, unknown> = {
		companyID: params.companyId,
		title: params.title.trim(),
		description: description,
		priority: parseInt(params.priority),
		status: 1,
		ticketType: parseInt(params.ticketType),
		source: 2 // Phone
	}

	// Add queueID if available (from params or default)
	if (queueId) {
		ticketPayload.queueID = queueId
	}

	// Add contactID if provided (links ticket to Autotask contact record)
	// This associates the ticket with the contact who reported the issue
	if (params.contactId) {
		ticketPayload.contactID = params.contactId
		// Set creatorType to indicate ticket was created by contact (not resource)
		ticketPayload.creatorType = 2 // 2 = Contact
	}

	// Add external ID for tracking (e.g., Retell call ID)
	if (params.externalID) {
		ticketPayload.externalID = params.externalID
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
 * @param ticketId - The Autotask ticket ID to retrieve
 * @returns Ticket details including number and assignment
 * @throws Error if the ticket is not found or API returns an error
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
 * @param resourceId - The Autotask resource ID to retrieve
 * @returns Resource details including phone numbers
 * @throws Error if the resource is not found or API returns an error
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

/**
 * Executes a single company search query with the specified operator.
 * 
 * @param companyName - The company/organization name to search for
 * @param operator - The search operator to use
 * @returns Array of matching companies
 * @throws Error if the API returns an error
 * @internal
 */
async function executeCompanySearch(companyName: string, operator: 'eq' | 'beginsWith' | 'contains'): Promise<CompanyDetails[]> {
	await rateLimiter.waitForTurn()

	logger.debug({ companyName, operator }, 'Executing company search')

	const searchPayload = JSON.stringify({
		filter: [
			{
				op: operator,
				field: 'companyName',
				value: companyName
			},
			{
				op: 'eq',
				field: 'isActive',
				value: 1
			}
		]
	})

	const options = {
		hostname: config.autotask.hostname,
		path: '/ATServicesRest/V1.0/Companies/query',
		method: 'POST',
		headers: {
			Host: config.autotask.hostname,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(searchPayload),
			'User-Agent': 'Node.js',
			ApiIntegrationCode: config.autotask.apiIntegrationCode,
			UserName: config.autotask.username,
			Secret: config.autotask.secret
		}
	}

	return new Promise<CompanyDetails[]>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode, operator }, 'Company search response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (!responseData || responseData.trim() === '') {
					return reject(new Error(`Autotask returned empty response (HTTP ${res.statusCode})`))
				}

				try {
					const data = JSON.parse(responseData) as AutotaskQueryResponse<CompanyDetails>

					if (res.statusCode !== 200) {
						logger.error({ statusCode: res.statusCode, response: data }, 'Company search API error')
						return reject(new Error(`Failed to search companies: ${res.statusCode} - ${JSON.stringify(data)}`))
					}

					logger.debug({ count: data.items?.length || 0, operator }, 'Company search query completed')
					resolve(data.items || [])
				} catch (e) {
					logger.error({ error: e, response: responseData.substring(0, 200) }, 'Invalid JSON from Autotask')
					reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`))
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Company search API request error')
			reject(error)
		})

		req.write(searchPayload)
		req.end()
	})
}

/**
 * Searches for a company by name in Autotask using a tiered strategy.
 * 
 * Uses a progressive search approach to maximize the chance of returning
 * a single, accurate result:
 * 1. **Exact match** (`eq`) - Returns only if company name matches exactly
 * 2. **Begins with** (`beginsWith`) - Falls back if no exact match
 * 3. **Contains** (`contains`) - Broadest search as last resort
 * 
 * This tiered approach helps avoid returning multiple ambiguous results
 * when the caller provides a precise company name.
 * 
 * @param companyName - The company/organization name to search for
 * @returns Array of matching companies
 * @throws Error if the API returns an error
 * 
 * @example
 * ```typescript
 * // Exact match "Acme Corp" returns 1 result
 * const companies = await searchCompanyByName('Acme Corp')
 * 
 * // Partial "Acme" might return multiple if no exact match exists
 * const companies = await searchCompanyByName('Acme')
 * ```
 */
export async function searchCompanyByName(companyName: string): Promise<CompanyDetails[]> {
	logger.info({ companyName }, 'Searching for company in Autotask (tiered strategy)')

	// Tier 1: Try exact match first (most precise)
	const exactResults = await executeCompanySearch(companyName, 'eq')
	if (exactResults.length > 0) {
		logger.info({ count: exactResults.length, companyName, strategy: 'exact' }, 'Company search completed')
		return exactResults
	}

	// Tier 2: Try beginsWith (e.g., "Acme" matches "Acme Corp" but not "Best Acme")
	const beginsWithResults = await executeCompanySearch(companyName, 'beginsWith')
	if (beginsWithResults.length > 0) {
		logger.info({ count: beginsWithResults.length, companyName, strategy: 'beginsWith' }, 'Company search completed')
		return beginsWithResults
	}

	// Tier 3: Fall back to contains (broadest search)
	const containsResults = await executeCompanySearch(companyName, 'contains')
	logger.info({ count: containsResults.length, companyName, strategy: 'contains' }, 'Company search completed')
	return containsResults
}

/**
 * Searches for contacts within a company by name.
 * 
 * @param companyID - The company ID to search within
 * @param firstName - Contact's first name
 * @param lastName - Contact's last name
 * @returns Array of matching contacts
 * @throws Error if the API returns an error
 */
export async function searchContactByName(companyID: number, firstName: string, lastName: string): Promise<ContactDetails[]> {
	await rateLimiter.waitForTurn()

	logger.info({ companyID, firstName, lastName }, 'Searching for contact in Autotask')

	const searchPayload = JSON.stringify({
		filter: [
			{
				op: 'eq',
				field: 'companyID',
				value: companyID
			},
			{
				op: 'contains',
				field: 'firstName',
				value: firstName
			},
			{
				op: 'contains',
				field: 'lastName',
				value: lastName
			},
			{
				op: 'eq',
				field: 'isActive',
				value: 1
			}
		]
	})

	const options = {
		hostname: config.autotask.hostname,
		path: '/ATServicesRest/V1.0/Contacts/query',
		method: 'POST',
		headers: {
			Host: config.autotask.hostname,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(searchPayload),
			'User-Agent': 'Node.js',
			ApiIntegrationCode: config.autotask.apiIntegrationCode,
			UserName: config.autotask.username,
			Secret: config.autotask.secret
		}
	}

	return new Promise<ContactDetails[]>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode }, 'Contact search response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (!responseData || responseData.trim() === '') {
					return reject(new Error(`Autotask returned empty response (HTTP ${res.statusCode})`))
				}

				try {
					const data = JSON.parse(responseData) as AutotaskQueryResponse<ContactDetails>

					if (res.statusCode !== 200) {
						logger.error({ statusCode: res.statusCode, response: data }, 'Contact search API error')
						return reject(new Error(`Failed to search contacts: ${res.statusCode} - ${JSON.stringify(data)}`))
					}

					// Log full contact details for debugging
					if (data.items && data.items.length > 0) {
						logger.debug({ firstContact: data.items[0] }, 'Contact search - first result details')
					}

					logger.info({ count: data.items?.length || 0, companyID, firstName, lastName }, 'Contact search completed')
					resolve(data.items || [])
				} catch (e) {
					logger.error({ error: e, response: responseData.substring(0, 200) }, 'Invalid JSON from Autotask')
					reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`))
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Contact search API request error')
			reject(error)
		})

		req.write(searchPayload)
		req.end()
	})
}

/**
 * Creates a new contact in Autotask for a given company.
 * 
 * @param params - Contact creation parameters
 * @param params.companyID - The company ID to associate the contact with
 * @param params.firstName - Contact's first name
 * @param params.lastName - Contact's last name
 * @param params.emailAddress - Contact's email address
 * @param params.phone - Contact's phone number
 * @returns The created contact details
 * @throws Error if the API returns an error
 */
export async function createContact(params: {
	companyID: number
	firstName: string
	lastName: string
	emailAddress?: string
	phone?: string
}): Promise<ContactDetails> {
	await rateLimiter.waitForTurn()

	logger.info({ companyID: params.companyID, firstName: params.firstName, lastName: params.lastName }, 'Creating contact in Autotask')

	const contactPayload: Record<string, unknown> = {
		companyID: params.companyID,
		firstName: params.firstName,
		lastName: params.lastName,
		isActive: 1
	}

	if (params.emailAddress) {
		contactPayload.emailAddress = params.emailAddress
	}
	if (params.phone) {
		contactPayload.phone = params.phone
	}

	const postData = JSON.stringify(contactPayload)

	// Use the Companies/{id}/Contacts child path for creating contacts
	const contactPath = `/ATServicesRest/V1.0/Companies/${params.companyID}/Contacts`
	logger.debug({ payload: contactPayload, path: contactPath }, 'Creating contact - request details')

	const options = {
		hostname: config.autotask.hostname,
		path: contactPath,
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

	return new Promise<ContactDetails>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode, headers: res.headers }, 'Create contact response received')

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
						logger.error({ statusCode: res.statusCode, response: data }, 'Create contact API error')
						return reject(new Error(`Failed to create contact: ${res.statusCode} - ${JSON.stringify(data)}`))
					}

					const contactId = data.itemId || data.item?.id
					logger.info({ contactId }, 'Contact created successfully')

					resolve({
						id: contactId,
						companyID: params.companyID,
						firstName: params.firstName,
						lastName: params.lastName,
						emailAddress: params.emailAddress,
						phone: params.phone,
						isActive: true
					})
				} catch (e) {
					logger.error({ error: e, statusCode: res.statusCode, response: responseData.substring(0, 500) }, 'Invalid JSON from Autotask - likely HTML error page')
					reject(new Error(`Invalid JSON response (HTTP ${res.statusCode}): ${responseData.substring(0, 200)}`))
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Create contact API request error')
			reject(error)
		})

		req.write(postData)
		req.end()
	})
}

/**
 * Updates an existing contact in Autotask using PATCH.
 * Only updates the fields provided in the params.
 * 
 * @param companyId - The company ID the contact belongs to
 * @param contactId - The contact ID to update
 * @param params - Fields to update
 * @param params.emailAddress - Contact's email address
 * @param params.phone - Contact's phone number
 * @throws Error if the API returns an error
 */
export async function updateContact(companyId: number, contactId: number, params: {
	emailAddress?: string
	phone?: string
}): Promise<void> {
	await rateLimiter.waitForTurn()

	logger.info({ companyId, contactId, ...params }, 'Updating contact in Autotask')

	const updatePayload: Record<string, unknown> = {
		id: contactId,
		companyID: companyId
	}

	if (params.emailAddress) {
		updatePayload.emailAddress = params.emailAddress
	}
	if (params.phone) {
		updatePayload.phone = params.phone
	}

	// Only make the call if there's something to update (more than just id and companyID)
	if (Object.keys(updatePayload).length <= 2) {
		logger.debug({ contactId }, 'No fields to update for contact')
		return
	}

	const patchData = JSON.stringify(updatePayload)

	// Use the Companies/{id}/Contacts child path for updating contacts
	const contactPath = `/ATServicesRest/V1.0/Companies/${companyId}/Contacts`
	logger.debug({ payload: updatePayload, path: contactPath }, 'Updating contact - request details')

	const options = {
		hostname: config.autotask.hostname,
		path: contactPath,
		method: 'PATCH',
		headers: {
			Host: config.autotask.hostname,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(patchData),
			'User-Agent': 'Node.js',
			ApiIntegrationCode: config.autotask.apiIntegrationCode,
			UserName: config.autotask.username,
			Secret: config.autotask.secret
		}
	}

	return new Promise<void>((resolve, reject) => {
		const req = https.request(options, (res) => {
			logger.debug({ statusCode: res.statusCode, contactId }, 'Update contact response received')

			let responseData = ''
			res.on('data', (chunk) => {
				responseData += chunk
			})

			res.on('end', () => {
				if (res.statusCode === 200) {
					logger.info({ contactId }, 'Contact updated successfully')
					resolve()
				} else {
					try {
						const data = JSON.parse(responseData)
						logger.error({ statusCode: res.statusCode, response: data }, 'Update contact API error')
						reject(new Error(`Failed to update contact: ${res.statusCode} - ${JSON.stringify(data)}`))
					} catch {
						reject(new Error(`Failed to update contact: ${res.statusCode} - ${responseData.substring(0, 200)}`))
					}
				}
			})
		})

		req.on('error', (error) => {
			logger.error({ error }, 'Update contact API request error')
			reject(error)
		})

		req.write(patchData)
		req.end()
	})
}
