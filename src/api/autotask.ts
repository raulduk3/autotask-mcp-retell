import https from 'https'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

export interface CreateTicketParams {
	contactName: string
	contactPhone?: string
	contactEmail?: string
	issueDescription: string
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

// Simple rate limiter for Autotask API calls
class RateLimiter {
	private lastCallTime = 0
	private readonly minInterval = 1000 // Minimum 1 second between calls

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

${params.issueDescription}`

	const ticketPayload = {
		companyID: config.autotask.companyId,
		title: params.title.trim(),
		description: description.trim(),
		priority: parseInt(params.priority),
		status: 1,
		ticketType: parseInt(params.ticketType),
		source: 2,
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
