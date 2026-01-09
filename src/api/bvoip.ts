/**
 * @fileoverview BVoip 1Stream API client for phone status management.
 * Provides functions to check technician phone availability and status
 * for call transfer decisions.
 * @module api/bvoip
 */
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

/**
 * Represents a phone status entry from BVoip GetPhoneStatuses API.
 */
export interface BVoipPhoneStatus {
	/** Extension number in the phone system */
	ExtensionNumber: string
	/** User's first name */
	FirstName: string
	/** User's last name */
	LastName: string
	/** Whether the extension is registered (online): 'True' or 'False' */
	IsRegistered: string
	/** Whether a call is being handled: 'Yes' or 'No' */
	CallHandled: string
	/** State of line 1: 'Idle', 'Connected', 'Ringing', 'Dialing', etc. */
	Line1State: string
	/** State of line 2 */
	Line2State: string
	/** State of line 3 */
	Line3State: string
	/** State of line 4 */
	Line4State: string
	/** User status: 'Available', 'Away', 'DND', 'Busy', 'Offline', etc. */
	UserStatus: string
	/** Queue status: 'LoggedIn', 'LoggedOut', 'None' */
	QueueStatus: string
}

/**
 * Fetches all phone statuses from the BVoip 1Stream API.
 * 
 * Calls the GetPhoneStatuses endpoint to retrieve current status
 * of all extensions, queues, and external parties in the phone system.
 * 
 * @returns Array of phone status objects for all extensions
 * @throws Error if the API key is not configured
 * @throws Error if the API request fails
 * 
 * @example
 * ```typescript
 * const statuses = await getPhoneStatuses()
 * const availableExtensions = statuses.filter(s => 
 *   s.IsRegistered === 'True' && s.UserStatus === 'Available'
 * )
 * ```
 */
export async function getPhoneStatuses(): Promise<BVoipPhoneStatus[]> {
	const apiKey = config.bvoip.apiKey
	const baseUrl = config.bvoip.baseUrl

	if (!apiKey) {
		throw new Error('BVoip API key not configured')
	}

	const url = `${baseUrl}/api/ClientAccess.svc/GetPhoneStatuses`
	
	logger.debug({ url }, 'Fetching phone statuses from BVoip')

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Authorization': apiKey
		}
	})

	if (!response.ok) {
		throw new Error(`BVoip API error: ${response.status} ${response.statusText}`)
	}

	const data = await response.json() as BVoipPhoneStatus[]
	
	logger.debug({ count: data.length }, 'Retrieved phone statuses from BVoip')
	
	return data
}

/**
 * Checks if an extension has any active calls on any line.
 * 
 * @param status - BVoip phone status object
 * @returns True if any line is in an active state (Connected, Ringing, Dialing)
 * 
 * @example
 * ```typescript
 * const status = statuses.find(s => s.ExtensionNumber === '102')
 * if (hasActiveCalls(status)) {
 *   console.log('Extension is busy')
 * }
 * ```
 */
export function hasActiveCalls(status: BVoipPhoneStatus): boolean {
	const activeStates = ['Connected', 'Ringing', 'Dialing']
	return (
		activeStates.includes(status.Line1State) ||
		activeStates.includes(status.Line2State) ||
		activeStates.includes(status.Line3State) ||
		activeStates.includes(status.Line4State)
	)
}

/**
 * Normalizes a phone number by removing non-digit characters.
 * 
 * @param phone - Phone number to normalize
 * @returns Digits-only phone number
 * 
 * @example
 * ```typescript
 * normalizePhone('(555) 123-4567') // Returns '5551234567'
 * normalizePhone('+1-555-123-4567') // Returns '15551234567'
 * ```
 */
export function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, '')
}

/**
 * Finds a matching phone status by phone number or extension.
 * 
 * Matches against extension numbers using flexible matching:
 * - Exact match
 * - Input ends with extension
 * - Extension ends with input
 * 
 * @param statuses - Array of phone status objects
 * @param phoneNumber - Phone number or extension to find
 * @returns Matching phone status or undefined if not found
 * 
 * @example
 * ```typescript
 * const statuses = await getPhoneStatuses()
 * const match = findPhoneStatus(statuses, '5551234567')
 * if (match) {
 *   console.log(`Found ${match.FirstName} ${match.LastName}`)
 * }
 * ```
 */
export function findPhoneStatus(
	statuses: BVoipPhoneStatus[],
	phoneNumber: string
): BVoipPhoneStatus | undefined {
	const normalizedInput = normalizePhone(phoneNumber)
	
	return statuses.find(status => {
		const ext = status.ExtensionNumber
		// Match exact extension or if input ends with the extension
		return ext === normalizedInput || 
			normalizedInput.endsWith(ext) || 
			ext.endsWith(normalizedInput)
	})
}

/**
 * Gets the display name for an extension.
 * 
 * @param status - BVoip phone status object
 * @returns Full name or fallback to "Extension {number}"
 */
export function getExtensionDisplayName(status: BVoipPhoneStatus): string {
	return [status.FirstName, status.LastName]
		.filter(Boolean)
		.join(' ') || `Extension ${status.ExtensionNumber}`
}

/**
 * Checks if a user status indicates unavailability.
 * 
 * @param userStatus - The UserStatus field from BVoip
 * @returns True if the status indicates the user is unavailable
 */
export function isUnavailableStatus(userStatus: string): boolean {
	const unavailableStatuses = ['Away', 'DND', 'Busy', 'Offline']
	return unavailableStatuses.includes(userStatus)
}
