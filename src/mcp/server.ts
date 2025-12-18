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
			logger.info({ params }, 'Tool handler called')
			return await createTicketHandler(params as any)
		}
	)

	logger.info({ toolName: createTicketSchema.name }, 'MCP server created with tool registered')

	return server
}
