/**
 * @fileoverview MCP Server factory with tool registration.
 * 
 * Creates and configures the Model Context Protocol (MCP) server instance
 * with all available tools for Autotask integration. This module is the
 * bridge between the HTTP server and the Autotask API tools.
 * 
 * Registered Tools:
 * - `lookupCompanyContact` — Search for companies and contacts by name
 * - `createTicket` — Create new service requests or incidents
 * - `getTicket` — Retrieve existing ticket details
 * - `checkResourceAvailability` — Check if a technician's phone line is available via BVoip
 * 
 * @module mcp/server
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createTicketSchema, createTicketHandler } from './tools/createTicket.js'
import { lookupCompanyContactSchema, lookupCompanyContactHandler } from './tools/lookupCompanyContact.js'
import { getTicketSchema, getTicketHandler } from './tools/getTicket.js'
import { checkResourceAvailabilitySchema, checkResourceAvailabilityHandler } from './tools/checkResourceAvailability.js'
import { logger } from '../utils/logger.js'

/**
 * Creates and configures a new MCP server instance with all tools registered.
 * 
 * The server is configured with:
 * 
 * Server name: `autotask-mcp-server`
 * 
 * Version: `0.1.0`
 * 
 * Capabilities: tools (enabled)
 * 
 * Each tool is registered with its schema and an error-handling wrapper that
 * catches unexpected errors and returns them as proper MCP error responses.
 * 
 * @returns Configured MCP server instance ready for transport connection
 * 
 * @example
 * ```typescript
 * import { createMcpServer } from './mcp/server.js'
 * 
 * const mcpServer = createMcpServer()
 * await mcpServer.connect(transport)
 * ```
 * 
 * @see {@link https://modelcontextprotocol.io/docs/concepts/tools|MCP Tools Documentation}
 */
export function createMcpServer(): McpServer {
	logger.debug('Creating MCP Server instance')

	const server = new McpServer(
		{
			name: 'autotask-mcp-server',
			version: '0.1.0'
		},
		{
			capabilities: {
				tools: {}
			}
		}
	)

	// Register the lookupCompanyContact tool
	server.registerTool(
		lookupCompanyContactSchema.name,
		{
			description: lookupCompanyContactSchema.description,
			inputSchema: lookupCompanyContactSchema.inputSchema
		},
		async (params) => {
			try {
				logger.info({ params, tool: lookupCompanyContactSchema.name }, 'Tool handler called')
				return await lookupCompanyContactHandler(params as Parameters<typeof lookupCompanyContactHandler>[0])
			} catch (error) {
				logger.error({ error, tool: lookupCompanyContactSchema.name }, 'Unexpected error in tool handler')
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								status: 'error',
								error: error instanceof Error ? error.message : 'Unknown error occurred'
							})
						}
					],
					isError: true
				}
			}
		}
	)

	// Register the createTicket tool
	server.registerTool(
		createTicketSchema.name,
		{
			description: createTicketSchema.description,
			inputSchema: createTicketSchema.inputSchema
		},
		async (params) => {
			try {
				logger.info({ params, tool: createTicketSchema.name }, 'Tool handler called')
				return await createTicketHandler(params as Parameters<typeof createTicketHandler>[0])
			} catch (error) {
				// Ensure any unexpected errors are properly caught and returned
				logger.error({ error, tool: createTicketSchema.name }, 'Unexpected error in tool handler')
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								status: 'error',
								error: error instanceof Error ? error.message : 'Unknown error occurred'
							})
						}
					],
					isError: true
				}
			}
		}
	)

	// Register the getTicket tool
	server.registerTool(
		getTicketSchema.name,
		{
			description: getTicketSchema.description,
			inputSchema: getTicketSchema.inputSchema
		},
		async (params) => {
			try {
				logger.info({ params, tool: getTicketSchema.name }, 'Tool handler called')
				return await getTicketHandler(params as Parameters<typeof getTicketHandler>[0])
			} catch (error) {
				logger.error({ error, tool: getTicketSchema.name }, 'Unexpected error in tool handler')
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								status: 'error',
								error: error instanceof Error ? error.message : 'Unknown error occurred'
							})
						}
					],
					isError: true
				}
			}
		}
	)

	// Register the checkResourceAvailability tool
	server.registerTool(
		checkResourceAvailabilitySchema.name,
		{
			description: checkResourceAvailabilitySchema.description,
			inputSchema: checkResourceAvailabilitySchema.inputSchema
		},
		async (params) => {
			try {
				logger.info({ params, tool: checkResourceAvailabilitySchema.name }, 'Tool handler called')
				return await checkResourceAvailabilityHandler(params as Parameters<typeof checkResourceAvailabilityHandler>[0])
			} catch (error) {
				logger.error({ error, tool: checkResourceAvailabilitySchema.name }, 'Unexpected error in tool handler')
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								status: 'error',
								error: error instanceof Error ? error.message : 'Unknown error occurred'
							})
						}
					],
					isError: true
				}
			}
		}
	)

	logger.info(
		{ tools: [lookupCompanyContactSchema.name, createTicketSchema.name, getTicketSchema.name, checkResourceAvailabilitySchema.name] },
		'MCP server created with tools registered'
	)

	return server
}
