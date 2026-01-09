/**
 * @fileoverview MCP tool for checking resource phone availability via BVoip.
 * 
 * Queries the BVoip 1Stream API to determine if a technician's phone line
 * is currently available for call transfer or if they are busy on another call.
 * 
 * @module mcp/tools/checkResourceAvailability
 */
import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { logger } from '../../utils/logger.js'
import { config } from '../../config.js'
import {
	getPhoneStatuses,
	findPhoneStatus,
	getExtensionDisplayName,
	hasActiveCalls,
	isUnavailableStatus
} from '../../api/bvoip.js'

/**
 * Schema definition for the checkResourceAvailability MCP tool.
 * 
 * Defines the tool's name, description, and input validation using Zod.
 * This schema is registered with the MCP server and exposed to AI agents.
 * 
 * @example
 * ```typescript
 * // Tool input:
 * { phoneNumber: '5551234567' }
 * 
 * // Successful response (available):
 * {
 *   status: 'success',
 *   isAvailable: true,
 *   extensionNumber: '102',
 *   extensionName: 'John Doe',
 *   userStatus: 'Available',
 *   message: 'John Doe is available for transfer'
 * }
 * 
 * // Successful response (busy):
 * {
 *   status: 'success',
 *   isAvailable: false,
 *   extensionNumber: '102',
 *   extensionName: 'John Doe',
 *   userStatus: 'Available',
 *   lineState: 'Connected',
 *   message: 'John Doe is currently on another call'
 * }
 * ```
 */
export const checkResourceAvailabilitySchema = {
	name: 'checkResourceAvailability',
	description: 'Check if a technician\'s phone line is available for call transfer via BVoip. Input: phoneNumber (the technician\'s phone number or extension to check). Returns availability status and whether transfer is possible.',
	inputSchema: z.object({
		phoneNumber: z.string().describe('The phone number or extension to check availability for')
	})
}

/**
 * Handles the checkResourceAvailability tool invocation from MCP clients.
 * 
 * Queries BVoip to determine if a technician is available for call transfer:
 * 1. Fetches all phone statuses from BVoip
 * 2. Finds the matching extension by phone number
 * 3. Checks registration status and active calls
 * 4. Returns availability for transfer decision
 * 
 * @param params - The validated tool parameters
 * @param params.phoneNumber - The phone number or extension to check
 * @returns MCP tool result with availability status or error
 * 
 * @example
 * ```typescript
 * const result = await checkResourceAvailabilityHandler({ phoneNumber: '5551234' })
 * const data = JSON.parse(result.content[0].text)
 * if (data.isAvailable) {
 *   console.log(`${data.extensionName} is available for transfer`)
 * } else {
 *   console.log(`${data.extensionName} is busy: ${data.message}`)
 * }
 * ```
 */
export async function checkResourceAvailabilityHandler(params: {
	phoneNumber: string
}): Promise<CallToolResult> {
	const { phoneNumber } = params

	logger.info({ tool: 'checkResourceAvailability', phoneNumber }, 'Tool call: checkResourceAvailability')

	try {
		// Check if BVoip is configured
		if (!config.bvoip.apiKey) {
			logger.warn('BVoip API key not configured, returning unavailable')
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							status: 'error',
							isAvailable: false,
							error: 'Phone system integration not configured',
							message: 'Unable to check phone availability. The technician may be available - please try the transfer.'
						})
					}
				]
			}
		}

		const statuses = await getPhoneStatuses()
		const matchingStatus = findPhoneStatus(statuses, phoneNumber)

		if (!matchingStatus) {
			logger.info({ phoneNumber }, 'No matching extension found in BVoip')
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							status: 'not_found',
							isAvailable: false,
							message: 'Extension not found in phone system. The technician may still be reachable - please try the transfer.'
						})
					}
				]
			}
		}

		const extensionName = getExtensionDisplayName(matchingStatus)

		// Check if phone is registered (online)
		if (matchingStatus.IsRegistered !== 'True') {
			logger.info(
				{ extensionNumber: matchingStatus.ExtensionNumber, extensionName },
				'Extension not registered (offline)'
			)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							status: 'success',
							isAvailable: false,
							extensionNumber: matchingStatus.ExtensionNumber,
							extensionName,
							userStatus: matchingStatus.UserStatus,
							message: `${extensionName} is currently offline and cannot receive calls`
						})
					}
				]
			}
		}

		// Check if currently on a call
		const onCall = hasActiveCalls(matchingStatus) || matchingStatus.CallHandled === 'Yes'

		if (onCall) {
			logger.info(
				{ extensionNumber: matchingStatus.ExtensionNumber, extensionName, line1State: matchingStatus.Line1State },
				'Extension is currently on a call'
			)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							status: 'success',
							isAvailable: false,
							extensionNumber: matchingStatus.ExtensionNumber,
							extensionName,
							userStatus: matchingStatus.UserStatus,
							lineState: matchingStatus.Line1State,
							message: `${extensionName} is currently on another call`
						})
					}
				]
			}
		}

		// Check user status (Available, Away, DND, etc.)
		if (isUnavailableStatus(matchingStatus.UserStatus)) {
			logger.info(
				{ extensionNumber: matchingStatus.ExtensionNumber, extensionName, userStatus: matchingStatus.UserStatus },
				'Extension has unavailable status'
			)
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							status: 'success',
							isAvailable: false,
							extensionNumber: matchingStatus.ExtensionNumber,
							extensionName,
							userStatus: matchingStatus.UserStatus,
							message: `${extensionName} is currently set to ${matchingStatus.UserStatus}`
						})
					}
				]
			}
		}

		// Extension is available
		logger.info(
			{ extensionNumber: matchingStatus.ExtensionNumber, extensionName, userStatus: matchingStatus.UserStatus },
			'Extension is available for transfer'
		)
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						status: 'success',
						isAvailable: true,
						extensionNumber: matchingStatus.ExtensionNumber,
						extensionName,
						userStatus: matchingStatus.UserStatus,
						message: `${extensionName} is available for transfer`
					})
				}
			]
		}

	} catch (error) {
		logger.error({ error, phoneNumber }, 'Error checking resource availability')
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						status: 'error',
						isAvailable: false,
						error: error instanceof Error ? error.message : 'Unknown error occurred',
						message: 'Unable to check phone availability. Please try the transfer anyway.'
					})
				}
			],
			isError: true
		}
	}
}
