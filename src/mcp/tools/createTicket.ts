import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createTicket } from '../../api/autotask.js'
import { logger } from '../../utils/logger.js'

export const createTicketSchema = {
	name: 'createTicket',
	description: 'Create an Autotask ticket (service request or incident)',
	inputSchema: z.object({
		contactName: z.string().describe('Name of the person reporting the issue'),
		contactPhone: z.string().optional().describe('Phone number of the contact'),
		contactEmail: z.string().optional().describe('Email of the contact'),
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
	issueDescription: string
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

		return {
			content: [
				{
					type: 'text',
					text: `Ticket created! Number: ${ticketId}`
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
					text: `Error creating ticket: ${error instanceof Error ? error.message : String(error)}`
				}
			],
			isError: true
		}
	}
}
