import https from 'https'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

export interface CreateTicketParams {
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

export interface AutotaskTicketResponse {
	itemId?: string
	item?: {
		id: string
	}
}

export interface TicketDetails {
	id: string
	ticketNumber: string
	assignedResourceID?: string
	title: string
	status: number
	priority: number
}

export interface AutotaskQueryResponse<T> {
	items: T[]
	pageDetails?: {
		count: number
		requestCount: number
	}
}

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

// Simple rate limiter for Autotask API calls
class RateLimiter {
	private lastCallTime = 0
	private readonly minInterval = 10 // Minimum 10 milliseconds between calls

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

const rateLimiter = new RateLimiter()

/**
 * Create a ticket in Autotask
 */
export async function createTicket(params: CreateTicketParams): Promise<AutotaskTicketResponse> {
	// Rate limit API calls
	await rateLimiter.waitForTurn()

	logger.info({ externalID: params.externalID }, 'Calling Autotask API')

	const description = `Contact: ${params.contactName}
${params.contactPhone ? `Phone: ${params.contactPhone}` : ''}
${params.contactEmail ? `Email: ${params.contactEmail}` : ''}
${params.preferredContactMethod ? `Preferred Contact Method: ${params.preferredContactMethod}` : ''}

${params.issueDescription}`

	const ticketPayload = {
		companyID: config.autotask.companyId,
		title: params.title.trim(),
		description: description.trim(),
		priority: parseInt(params.priority),
		status: 1,
		ticketType: parseInt(params.ticketType),
		preferredContactMethod: params.preferredContactMethod,
		source: 2, // Phone
		queueID: config.autotask.queueId,
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
 * Get ticket details by ticket ID
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
 * Get resource details by resource ID
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
