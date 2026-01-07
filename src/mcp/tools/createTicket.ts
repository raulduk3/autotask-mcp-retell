/**
 * @fileoverview MCP tool definition and handler for creating Autotask tickets.
 * This is the primary tool exposed by the MCP server, allowing Retell AI agents
 * to create service requests and incidents in Autotask via voice interactions.
 * @module mcp/tools/createTicket
 */
import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createTicket, getTicketById, getResourceById } from '../../api/autotask.js'
import { logger } from '../../utils/logger.js'
import { isValidTenant, config } from '../../config.js'

/**
 * Schema definition for the createTicket MCP tool.
 * 
 * This object defines the tool's name, description, and input validation schema
 * using Zod for runtime type checking. The schema is registered with the MCP server
 * and exposed to connected AI agents.
 * 
 * @property {string} name - Tool identifier: 'createTicket'
 * @property {string} description - Human-readable tool description for the AI agent
 * @property {z.ZodObject} inputSchema - Zod schema validating all required ticket fields
 * 
 * @example
 * // Tool input example:
 * {
 *   companyId: '12345',
 *   queueId: '67890',
 *   contactName: 'John Doe',
 *   contactPhone: '555-1234',
 *   contactEmail: 'john@example.com',
 *   preferredContactMethod: 'phone',
 *   issueDescription: 'Printer not working',
 *   title: 'Printer Issue',
 *   ticketType: '2',  // Incident
 *   priority: '2',    // P3 Medium
 *   externalID: 'retell-call-abc123'
 * }
 * 
 * @const {Object}
 */
export const createTicketSchema = {
	name: 'createTicket',
	description: 'Create an Autotask ticket (service request or incident)',
	inputSchema: z.object({
		companyId: z.string().describe('Autotask company ID for the tenant'),
		queueId: z.string().describe('Autotask queue ID for ticket routing'),
		contactName: z.string().describe('Name of the person reporting the issue'),
		contactPhone: z.string().describe('Phone number of the contact'),
		contactEmail: z.string().describe('Email of the contact'),
		preferredContactMethod: z
			.enum(['phone', 'email'])
			.describe('Preferred method of contact: phone or email'),
		issueDescription: z.string().describe('Description of the issue or service request'),
		title: z.string().describe('Title of the issue or service request'),
		ticketType: z.enum(['1', '2']).describe('1 for Service Request, 2 for Incident'),
		priority: z
			.enum(['4', '1', '2', '5'])
			.describe('4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low'),
		externalID: z.string().describe('External ID from Retell call')
	})
}

/**
 * Handles the createTicket tool invocation from MCP clients.
 * 
 * This handler:
 * 1. Validates the tenant (companyId) against the whitelist
 * 2. Creates a ticket in Autotask via the REST API
 * 3. Retrieves ticket details including ticket number
 * 4. Optionally retrieves assigned resource details for call transfer
 * 
 * @async
 * @function createTicketHandler
 * @param {Object} params - The validated tool parameters
 * @param {string} params.companyId - Autotask company ID for tenant isolation
 * @param {string} params.queueId - Autotask queue ID for ticket routing
 * @param {string} params.contactName - Name of the person reporting the issue
 * @param {string} [params.contactPhone] - Contact's phone number
 * @param {string} [params.contactEmail] - Contact's email address
 * @param {string} params.issueDescription - Detailed description of the issue
 * @param {'phone'|'email'} params.preferredContactMethod - How the contact prefers to be reached
 * @param {string} params.title - Brief title/summary of the ticket
 * @param {'1'|'2'} params.ticketType - '1' for Service Request, '2' for Incident
 * @param {'4'|'1'|'2'|'5'} params.priority - Priority level: 4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low
 * @param {string} params.externalID - External reference ID from Retell call
 * 
 * @returns {Promise<CallToolResult>} MCP tool result with ticket details or error
 * @returns {Array<{type: 'text', text: string}>} result.content - JSON string with status, ticket_id, ticket_number, and optionally assigned_tech and transfer_phone
 * @returns {boolean} [result.isError] - True if the operation failed
 * 
 * @throws {Error} Propagates Autotask API errors wrapped in the result object
 * 
 * @example
 * // Success response:
 * {
 *   content: [{ type: 'text', text: '{"status":"success","ticket_id":"123","ticket_number":"T20240101.0001","assigned_tech":"Jane Smith","transfer_phone":"555-9999"}' }]
 * }
 * 
 * // Error response:
 * {
 *   content: [{ type: 'text', text: '{"status":"error","error":"Invalid company ID: 99999"}' }],
 *   isError: true
 * }
 */
export async function createTicketHandler(params: {
	companyId: string
	queueId: string
	contactName: string
	contactPhone?: string
	contactEmail?: string
	issueDescription: string,
	preferredContactMethod: 'phone' | 'email'
	title: string
	ticketType: '1' | '2'
	priority: '4' | '1' | '2' | '5'
	externalID: string
}): Promise<CallToolResult> {
	const companyId = parseInt(params.companyId) || config.autotask.companyId
	const queueId = parseInt(params.queueId) || config.autotask.queueId

	logger.info(
		{
			tool: 'createTicket',
			companyId,
			queueId,
			externalID: params.externalID,
			ticketType: params.ticketType,
			priority: params.priority,
			title: params.title
		},
		'Tool call: createTicket'
	)

	// Validate tenant
	if (!isValidTenant(companyId)) {
		logger.warn({ companyId, queueId }, 'Invalid tenant - not in whitelist')
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						status: 'error',
						error: `Invalid company ID: ${companyId}`
					})
				}
			],
			isError: true
		}
	}

	try {
		const result = await createTicket({ ...params, companyId, queueId })
		const ticketId = result.itemId || result.item?.id || 'Unknown'

		logger.info({ ticketId, externalID: params.externalID }, 'Ticket created successfully via tool')

		// Get ticket details to retrieve ticket number and assigned resource
		let ticketDetails = null
		let resourceDetails = null
		let transferPhone = null

		try {
			ticketDetails = await getTicketById(ticketId)
			logger.info(
				{
					ticketId,
					ticketNumber: ticketDetails.ticketNumber,
					assignedResourceID: ticketDetails.assignedResourceID
				},
				'Retrieved ticket details'
			)

			// If a resource is assigned, get their details for phone transfer
			if (ticketDetails.assignedResourceID) {
				try {
					resourceDetails = await getResourceById(ticketDetails.assignedResourceID)
					// Prefer mobile phone, then office phone
					transferPhone = resourceDetails.mobilePhone || resourceDetails.officePhone

					logger.info(
						{
							resourceId: resourceDetails.id,
							resourceName: `${resourceDetails.firstName} ${resourceDetails.lastName}`,
							transferPhone
						},
						'Retrieved assigned resource details'
					)
				} catch (resourceError) {
					logger.warn(
						{ error: resourceError, resourceId: ticketDetails.assignedResourceID },
						'Failed to retrieve resource details'
					)
				}
			}
		} catch (ticketError) {
			logger.warn({ error: ticketError, ticketId }, 'Failed to retrieve ticket details')
		}

		// Build response as stringified JSON object
		const responseData: Record<string, unknown> = {
			status: 'success',
			ticket_id: ticketId,
			ticket_number: ticketDetails?.ticketNumber || ticketId
		}

		if (resourceDetails) {
			responseData.assigned_tech = `${resourceDetails.firstName} ${resourceDetails.lastName}`
		}

		if (transferPhone) {
			responseData.transfer_phone = transferPhone
		}

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(responseData)
				}
			]
		}
	} catch (error) {
		logger.error(
			{
				error,
				externalID: params.externalID,
				tool: 'createTicket'
			},
			'Tool call failed: createTicket'
		)

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						status: 'error',
						error: error instanceof Error ? error.message : String(error)
					})
				}
			],
			isError: true
		}
	}
}
