import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createTicket, getTicketById, getResourceById } from '../../api/autotask.js'
import { logger } from '../../utils/logger.js'

export const createTicketSchema = {
	name: 'createTicket',
	description: 'Create an Autotask ticket (service request or incident)',
	inputSchema: z.object({
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

export async function createTicketHandler(params: {
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
	logger.info(
		{
			tool: 'createTicket',
			externalID: params.externalID,
			ticketType: params.ticketType,
			priority: params.priority,
			title: params.title
		},
		'Tool call: createTicket'
	)

	try {
		const result = await createTicket(params)
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
		const responseData: Record<string, any> = {
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
