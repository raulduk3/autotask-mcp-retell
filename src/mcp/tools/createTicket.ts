/**
 * @fileoverview MCP tool definition and handler for creating Autotask tickets.
 * This is the primary tool exposed by the MCP server, allowing Retell AI agents
 * to create service requests and incidents in Autotask via voice interactions.
 * @module mcp/tools/createTicket
 */
import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createTicket, getTicketById, getResourceById, updateContact } from '../../api/autotask.js'
import { logger } from '../../utils/logger.js'

/**
 * Schema definition for the createTicket MCP tool.
 * 
 * This object defines the tool's name, description, and input validation schema
 * using Zod for runtime type checking. The schema is registered with the MCP server
 * and exposed to connected AI agents.
 * 
 * @example
 * ```typescript
 * // Tool input example:
 * {
 *   companyId: '12345',
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
 * ```
 */
export const createTicketSchema = {
	name: 'createTicket',
	description: 'Create an Autotask ticket (service request or incident). Use lookupCompanyContact first to get companyId and contactId. If isNewContact is true and contact info is provided, the contact record will be updated.',
	inputSchema: z.object({
		companyId: z.string().describe('Autotask company ID (from lookupCompanyContact result)'),
		contactId: z.string().optional().describe('Autotask contact ID (from lookupCompanyContact result)'),
		isNewContact: z.boolean().optional().default(false).describe('Set to true if this is a newly created contact that needs callback info updated'),
		contactName: z.string().optional().describe('Name of the person reporting the issue (optional - contact already linked via contactId)'),
		contactPhone: z.string().optional().describe('Phone number of the contact (optional - only needed for new contacts or to update existing)'),
		contactEmail: z.string().optional().describe('Email of the contact (optional - only needed for new contacts or to update existing)'),
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
 * 1. Creates a ticket in Autotask via the REST API
 * 2. Retrieves ticket details including ticket number
 * 3. Optionally retrieves assigned resource details for call transfer
 * 
 * @param params - The validated tool parameters
 * @returns MCP tool result with ticket details or error
 * 
 * @example
 * ```typescript
 * // Success response:
 * {
 *   content: [{ type: 'text', text: '{"status":"success","ticket_id":"123","ticket_number":"T20240101.0001"}' }]
 * }
 * 
 * // Error response:
 * {
 *   content: [{ type: 'text', text: '{"status":"error","error":"Invalid company ID: 99999"}' }],
 *   isError: true
 * }
 * ```
 */
export async function createTicketHandler(params: {
	companyId: string
	contactId?: string
	isNewContact?: boolean
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
	const companyId = parseInt(params.companyId)
	const contactId = params.contactId ? parseInt(params.contactId) : undefined
	const isNewContact = params.isNewContact || false

	logger.info(
		{
			tool: 'createTicket',
			companyId,
			contactId,
			isNewContact,
			externalID: params.externalID,
			ticketType: params.ticketType,
			priority: params.priority,
			title: params.title
		},
		'Tool call: createTicket'
	)

	try {
		// Update contact info if:
		// 1. This is a new contact that needs callback info, OR
		// 2. Contact info is provided and we have a contactId (update existing contact too)
		logger.debug({ 
			contactId, 
			contactEmail: params.contactEmail, 
			contactPhone: params.contactPhone,
			hasContactId: !!contactId,
			hasEmail: !!params.contactEmail,
			hasPhone: !!params.contactPhone
		}, 'Checking if contact update is needed')
		
		if (contactId && (params.contactEmail || params.contactPhone)) {
			logger.info({ contactId, companyId, email: params.contactEmail, phone: params.contactPhone }, 'Attempting to update contact info')
			try {
				await updateContact(companyId, contactId, {
					emailAddress: params.contactEmail,
					phone: params.contactPhone
				})
				logger.info({ contactId, email: params.contactEmail, phone: params.contactPhone, isNewContact }, 'Updated contact with callback info')
			} catch (updateError) {
				logger.warn({ error: updateError, contactId }, 'Failed to update contact info, continuing with ticket creation')
			}
		} else {
			logger.debug({ contactId, hasEmail: !!params.contactEmail, hasPhone: !!params.contactPhone }, 'Skipping contact update - no contactId or no contact info provided')
		}

		const result = await createTicket({ ...params, companyId, contactId })
		const ticketId = result.itemId || result.item?.id || 'Unknown'

		logger.info({ ticketId, externalID: params.externalID }, 'Ticket created successfully via tool')

		// Wait for auto-assignment workflow to complete before fetching ticket details
		await new Promise(resolve => setTimeout(resolve, 1500))

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
			ticketId: ticketId,
			ticketNumber: ticketDetails?.ticketNumber || ticketId
		}

		if (resourceDetails) {
			responseData.assignedTech = `${resourceDetails.firstName} ${resourceDetails.lastName}`
		}

		if (transferPhone) {
			responseData.transferPhone = transferPhone
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
