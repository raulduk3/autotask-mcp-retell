/**
 * @fileoverview MCP tool for retrieving existing ticket details from Autotask.
 * 
 * Provides read-only access to ticket information including status, priority,
 * and assigned technician details for potential call transfers.
 * 
 * @module mcp/tools/getTicket
 */
import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getTicketById, getResourceById } from '../../api/autotask.js'
import { logger } from '../../utils/logger.js'

/**
 * Schema definition for the getTicket MCP tool.
 * 
 * Defines the tool's name, description, and input validation using Zod.
 * This schema is registered with the MCP server and exposed to AI agents.
 * 
 * @example
 * ```typescript
 * // Tool input:
 * { ticketId: '123456789' }
 * 
 * // Successful response:
 * {
 *   status: 'success',
 *   ticket_id: '123456789',
 *   ticket_number: 'T20240101.0001',
 *   title: 'Printer Issue',
 *   ticket_status: 1,
 *   priority: 2,
 *   assigned_tech: 'John Smith',
 *   transfer_phone: '555-1234'
 * }
 * ```
 */
export const getTicketSchema = {
	name: 'getTicket',
	description: 'Retrieve details of an existing Autotask ticket by ticket ID. Returns ticket number, status, priority, assigned technician, and transfer phone if available.',
	inputSchema: z.object({
		ticketId: z.string().describe('The Autotask ticket ID to retrieve')
	})
}

/**
 * Handles the getTicket tool invocation from MCP clients.
 * 
 * Retrieves detailed information about an existing Autotask ticket,
 * including the assigned technician's contact details for potential
 * call transfer functionality.
 * 
 * Response fields include: `status`, `ticket_id`, `ticket_number`, `title`,
 * `ticket_status`, `priority`, `assigned_tech` (if assigned), and
 * `transfer_phone` (if available).
 * 
 * @param params - The validated tool parameters
 * @param params.ticketId - The Autotask ticket ID to retrieve
 * @returns MCP tool result with ticket details or error
 * 
 * @example
 * ```typescript
 * const result = await getTicketHandler({ ticketId: '123456' })
 * const data = JSON.parse(result.content[0].text)
 * if (data.transfer_phone) {
 *   console.log(`Transfer to ${data.assigned_tech} at ${data.transfer_phone}`)
 * }
 * ```
 */
export async function getTicketHandler(params: {
	ticketId: string
}): Promise<CallToolResult> {
	const { ticketId } = params

	logger.info({ tool: 'getTicket', ticketId }, 'Tool call: getTicket')

	try {
		const ticketDetails = await getTicketById(ticketId)

		logger.info(
			{
				ticketId,
				ticketNumber: ticketDetails.ticketNumber,
				assignedResourceID: ticketDetails.assignedResourceID
			},
			'Retrieved ticket details'
		)

		const responseData: Record<string, unknown> = {
			status: 'success',
			ticket_id: ticketDetails.id,
			ticket_number: ticketDetails.ticketNumber,
			title: ticketDetails.title,
			ticket_status: ticketDetails.status,
			priority: ticketDetails.priority
		}

		// If a resource is assigned, get their details for phone transfer
		if (ticketDetails.assignedResourceID) {
			try {
				const resourceDetails = await getResourceById(ticketDetails.assignedResourceID)
				const transferPhone = resourceDetails.mobilePhone || resourceDetails.officePhone

				responseData.assigned_tech = `${resourceDetails.firstName} ${resourceDetails.lastName}`

				if (transferPhone) {
					responseData.transfer_phone = transferPhone
				}

				logger.info(
					{
						resourceId: resourceDetails.id,
						resourceName: responseData.assigned_tech,
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

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(responseData)
				}
			]
		}

	} catch (error) {
		logger.error({ error, ticketId, tool: 'getTicket' }, 'Tool call failed: getTicket')

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
