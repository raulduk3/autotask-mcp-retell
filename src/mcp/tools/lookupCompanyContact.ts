/**
 * @fileoverview MCP tool for looking up companies and contacts in Autotask.
 * 
 * Consolidates company lookup, contact search, and contact creation into a single
 * tool for efficient caller identification and verification workflows. This tool
 * is typically called before `createTicket` to obtain the required company and
 * contact identifiers.
 * 
 * @module mcp/tools/lookupCompanyContact
 */
import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { searchCompanyByName, searchContactByName, createContact } from '../../api/autotask.js'
import { logger } from '../../utils/logger.js'

/**
 * Schema definition for the lookupCompanyContact MCP tool.
 * 
 * Defines the tool's name, description, and input validation schema.
 * Used for searching companies by organization name and finding or
 * creating contacts within those companies.
 * 
 * @example
 * ```typescript
 * // Tool input:
 * {
 *   organizationName: 'Acme Corp',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   createIfNotFound: true
 * }
 * ```
 */
export const lookupCompanyContactSchema = {
	name: 'lookupCompanyContact',
	description: 'Look up a company by organization name, then find or create a contact within that company by first and last name. Returns company ID, contact ID, and contact details (including email/phone on file) for caller verification. Use this before creating a ticket.',
	inputSchema: z.object({
		organizationName: z.string().describe('The organization/company name to search for'),
		firstName: z.string().describe('Contact first name'),
		lastName: z.string().describe('Contact last name'),
		createIfNotFound: z.boolean().optional().default(true).describe('Create a new contact if no matching contact is found (default: true)')
	})
}

/**
 * Result of a company/contact lookup operation.
 * 
 * Flattened structure designed for direct mapping to Retell AI dynamic variables.
 * The status field indicates the outcome of the lookup operation.
 * @internal
 */
interface LookupResult {
	/** Operation outcome: 'success', 'error', 'not_found', or 'multiple_matches' */
	status: 'success' | 'error' | 'not_found' | 'multiple_matches'
	/** Autotask company ID (when found) */
	companyId?: number
	/** Autotask contact ID (when found or created) */
	contactId?: number
	/** Contact's email address on file (for verification) */
	emailAddress?: string
	/** Contact's phone number on file (for verification) */
	phone?: string
	/** True if the contact was newly created */
	isNew?: boolean
	/** Multiple company matches for disambiguation */
	matches?: Array<{ id: number; name: string }>
	/** Error message (when status is 'error' or 'not_found') */
	error?: string
	/** User-facing message for the AI agent */
	message?: string
}

/**
 * Handles the lookupCompanyContact tool invocation from MCP clients.
 * 
 * Implements a multi-step lookup workflow:
 * 1. Searches for the company by organization name
 * 2. If found, searches for the contact by name within that company
 * 3. Creates a new contact if not found and `createIfNotFound` is true
 * 4. Returns contact info on file for caller verification
 * 
 * Status outcomes: `success` (found/created), `not_found` (company or contact missing),
 * `multiple_matches` (needs disambiguation), `error` (API/system error).
 * 
 * @param params - The validated tool parameters
 * @param params.organizationName - Company/organization name to search for
 * @param params.firstName - Contact's first name
 * @param params.lastName - Contact's last name
 * @param params.createIfNotFound - Whether to create a new contact if not found
 * @returns MCP tool result with lookup results or error
 * 
 * @example
 * ```typescript
 * const result = await lookupCompanyContactHandler({
 *   organizationName: 'Acme Corp',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   createIfNotFound: true
 * })
 * const data = JSON.parse(result.content[0].text)
 * if (data.status === 'success') {
 *   console.log(`Company: ${data.companyId}, Contact: ${data.contactId}`)
 * }
 * ```
 */
export async function lookupCompanyContactHandler(params: {
	organizationName: string
	firstName: string
	lastName: string
	createIfNotFound?: boolean
}): Promise<CallToolResult> {
	const { organizationName, firstName, lastName, createIfNotFound = true } = params

	logger.info(
		{ tool: 'lookupCompanyContact', organizationName, firstName, lastName },
		'Tool call: lookupCompanyContact'
	)

	const result: LookupResult = { status: 'success' }

	try {
		// Step 1: Search for company by name
		const companies = await searchCompanyByName(organizationName)

		if (companies.length === 0) {
			result.status = 'not_found'
			result.error = `No company found matching "${organizationName}"`
			result.message = 'Please verify the organization name with the caller.'
			return formatResult(result)
		}

		if (companies.length > 1) {
			// Multiple matches - return them for disambiguation
			result.status = 'multiple_matches'
			result.matches = companies.slice(0, 5).map(c => ({ id: c.id, name: c.companyName }))
			result.message = `Found ${companies.length} companies matching "${organizationName}". Please ask the caller to clarify which organization.`
			return formatResult(result)
		}

		// Single company match
		const company = companies[0]
		result.companyId = company.id

		logger.info({ companyId: company.id, companyName: company.companyName, companyIdType: typeof company.id }, 'Company found')

		// Step 2: Search for contact within the company
		const contacts = await searchContactByName(company.id, firstName, lastName)

		if (contacts.length === 0) {
			// No contact found
			if (createIfNotFound) {
				// Create new contact (without email/phone - will be updated on ticket creation)
				logger.info({ companyId: company.id, firstName, lastName }, 'Creating new contact')
				const newContact = await createContact({
					companyID: company.id,
					firstName,
					lastName
				})

				result.contactId = newContact.id
				result.emailAddress = ''
				result.phone = ''
				result.isNew = true
				result.message = `Created new contact. Please collect callback information (email and phone).`
			} else {
				result.status = 'not_found'
				result.error = `No contact named "${firstName} ${lastName}" found at ${company.companyName}`
				result.message = 'Please verify the contact name with the caller.'
			}
			return formatResult(result)
		}

		if (contacts.length > 1) {
			// Multiple contact matches - need verification to disambiguate
			// Return the first match but flag that verification is essential
			const contact = contacts[0]
			result.contactId = contact.id
			result.emailAddress = contact.emailAddress
			result.phone = contact.phone || contact.mobilePhone
			result.isNew = false
			result.message = `Found ${contacts.length} contacts with this name. Ask caller to verify their email or phone to confirm identity.`
			return formatResult(result)
		}

		// Single contact match - return with contact info on file for verification
		const contact = contacts[0]

		result.contactId = contact.id
		result.emailAddress = contact.emailAddress
		result.phone = contact.phone || contact.mobilePhone
		result.isNew = false

		// Build verification message
		if (result.emailAddress || result.phone) {
			result.message = `Found contact. Ask caller to verify their email or phone on file to confirm identity.`
		} else {
			result.message = `Found contact but no email or phone on file. Please collect callback information.`
		}

		return formatResult(result)

	} catch (error) {
		logger.error({ error, tool: 'lookupCompanyContact' }, 'Tool call failed: lookupCompanyContact')

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

/**
 * Formats a LookupResult into an MCP CallToolResult.
 * 
 * Converts the internal result structure to the MCP response format,
 * serializing the data as JSON text and setting the error flag based
 * on the result status.
 * 
 * @param result - The lookup operation result
 * @returns Formatted MCP tool result
 * @internal
 */
function formatResult(result: LookupResult): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(result)
			}
		],
		isError: result.status === 'error'
	}
}
