import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createTicketSchema, createTicketHandler } from './tools/createTicket.js'
import { logger } from '../utils/logger.js'

/**
 * Create and configure the MCP server with all tools
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

	// Register the createTicket tool
	server.registerTool(
		createTicketSchema.name,
		{
			description: createTicketSchema.description,
			inputSchema: createTicketSchema.inputSchema
		},
		async (params) => {
			try {
				logger.info({ params }, 'Tool handler called')
				return await createTicketHandler(params as any)
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

	logger.info({ toolName: createTicketSchema.name }, 'MCP server created with tool registered')

	return server
}
