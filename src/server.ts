import express, { Request, Response } from 'express'
import { config } from 'dotenv'
import { z } from 'zod'
import https from 'https'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

config()

const PORT = 3000
const app = express()
app.use(express.json())

// Store tool handler
const createTicketHandler = async (params: {
	contactName: string
	contactPhone?: string
	contactEmail?: string
	issueDescription: string
	ticketType: '1' | '2'
	priority: '4' | '1' | '2' | '5'
	externalID: string
}): Promise<CallToolResult> => {
	console.log('\n🔧 TOOL CALL: createTicket')
	console.log('Parameters:', JSON.stringify(params, null, 2))

	const description = `Contact: ${params.contactName}
${params.contactPhone ? `Phone: ${params.contactPhone}` : ''}
${params.contactEmail ? `Email: ${params.contactEmail}` : ''}

Issue:
${params.issueDescription}`

	const ticketPayload = {
		companyID: 0,
		title: "-",
		description: description.trim(),
		priority: parseInt(params.priority),
		status: 1,
		ticketType: parseInt(params.ticketType),
		source: 2,
		queueID: 29683498,
		externalID: params.externalID
	}

	try {
		console.log('→ Calling Autotask API...')
		console.log('→ Payload:', JSON.stringify(ticketPayload, null, 2))
		
		const postData = JSON.stringify(ticketPayload)

		// Debug: Log actual credential values being used
		const apiCode = (process.env.AUTOTASK_API_INTEGRATION_CODE || '').trim()
		const userName = (process.env.AUTOTASK_USERNAME || '').trim()
		const secret = (process.env.AUTOTASK_SECRET || '').trim()
		
		console.log('→ Credentials being used:')
		console.log('  ApiIntegrationCode:', apiCode ? `${apiCode.substring(0, 10)}... (length: ${apiCode.length})` : 'EMPTY!')
		console.log('  UserName:', userName ? `${userName} (length: ${userName.length})` : 'EMPTY!')
		console.log('  Secret:', secret ? `${secret.substring(0, 5)}... (length: ${secret.length})` : 'EMPTY!')

		const options = {
			hostname: 'webservices15.autotask.net',
			path: '/ATServicesRest/V1.0/Tickets/',
			method: 'POST',
			headers: {
				'Host': 'webservices15.autotask.net',
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(postData),
				'User-Agent': 'Node.js',
				'ApiIntegrationCode': apiCode,
				'UserName': userName,
				'Secret': secret
			}
		}

		return await new Promise<CallToolResult>((resolve) => {
			const req = https.request(options, (res) => {
				console.log('✓ Status:', res.statusCode)

				let responseData = ''
				res.on('data', (chunk) => {
					responseData += chunk
				})

				res.on('end', () => {
					console.log('✓ Response:', responseData.substring(0, 300))

					if (!responseData || responseData.trim() === '') {
						return resolve({
							content: [{
								type: 'text',
								text: `Autotask returned empty response (HTTP ${res.statusCode})`
							}],
							isError: true
						})
					}

					try {
						const data = JSON.parse(responseData)

						if (res.statusCode !== 200 && res.statusCode !== 201) {
							return resolve({
								content: [{
									type: 'text',
									text: `Failed to create ticket: ${res.statusCode} - ${JSON.stringify(data)}`
								}],
								isError: true
							})
						}

						return resolve({
							content: [{
								type: 'text',
								text: `✅ Ticket created! Number: ${data.itemId || data.item?.id || 'Unknown'}`
							}]
						})
					} catch (e) {
						return resolve({
							content: [{
								type: 'text',
								text: `Invalid JSON response: ${responseData.substring(0, 200)}`
							}],
							isError: true
						})
					}
				})
			})

			req.on('error', (error) => {
				console.error('✗ Request Error:', error)
				resolve({
					content: [{
						type: 'text',
						text: `Error creating ticket: ${error.message}`
					}],
					isError: true
				})
			})

			req.write(postData)
			req.end()
		})
	} catch (error) {
		console.error('✗ Tool Error:', error)
		return {
			content: [{
				type: 'text',
				text: `Error creating ticket: ${error instanceof Error ? error.message : String(error)}`
			}],
			isError: true
		}
	}
}

// Create ONE shared MCP server for all requests (no transport layer)
let server: McpServer | null = null

// Initialize the MCP server
function initializeServer() {
	if (server) {
		return server
	}

	console.log('\n>>> Creating MCP Server <<<')

	server = new McpServer(
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

	// Register the createTicket tool (just for MCP server, but we call handler directly)
	server.registerTool(
		'createTicket',
		{
			description: 'Create an Autotask ticket (service request or incident)',
			inputSchema: z.object({
				contactName: z.string().describe('Name of the person reporting the issue'),
				contactPhone: z.string().optional().describe('Phone number of the contact'),
				contactEmail: z.string().optional().describe('Email of the contact'),
				issueDescription: z.string().describe('Description of the issue or service request'),
				ticketType: z.enum(['1', '2']).describe('1 for Service Request, 2 for Incident'),
				priority: z.enum(['4', '1', '2', '5']).describe('4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low'),
				externalID: z.string().describe('External ID from Retell call')
			})
		},
		createTicketHandler
	)

	console.log('✓ Server created with createTicket tool\n')
	return server
}

// Handle JSON-RPC requests directly
app.post('/mcp', async (req: Request, res: Response) => {
	const { method, params, id } = req.body

	console.log(`\n=== POST /mcp ===`)
	console.log('Method:', method)
	console.log('ID:', id)
	console.log('Body:', JSON.stringify(req.body, null, 2))
	console.log('=================\n')

	try {
		const mcpServer = initializeServer()

		// Handle initialize
		if (method === 'initialize') {
			const response = {
				jsonrpc: '2.0',
				id,
				result: {
					protocolVersion: '2025-06-18',
					capabilities: {
						tools: {}
					},
					serverInfo: {
						name: 'autotask-mcp-server',
						version: '0.1.0'
					}
				}
			}
			console.log('📤 RESPONSE:', JSON.stringify(response, null, 2), '\n')
			return res.json(response)
		}

		// Handle notifications/initialized
		if (method === 'notifications/initialized') {
			console.log('✓ Initialized notification received\n')
			return res.status(200).end()
		}

		// Handle tools/list
		if (method === 'tools/list') {
			const response = {
				jsonrpc: '2.0',
				id,
				result: {
					tools: [
						{
							name: 'createTicket',
							description: 'Create an Autotask ticket (service request or incident)',
							inputSchema: {
								type: 'object',
								properties: {
									contactName: {
										type: 'string',
										description: 'Name of the person reporting the issue'
									},
									contactPhone: {
										type: 'string',
										description: 'Phone number of the contact'
									},
									contactEmail: {
										type: 'string',
										description: 'Email of the contact'
									},
									issueDescription: {
										type: 'string',
										description: 'Description of the issue or service request'
									},
									ticketType: {
										type: 'string',
										enum: ['1', '2'],
										description: '1 for Service Request, 2 for Incident'
									},
									priority: {
										type: 'string',
										enum: ['4', '1', '2', '5'],
										description: '4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low'
									},
									externalID: {
										type: 'string',
										description: 'External ID from Retell call'
									}
								},
								required: ['contactName', 'issueDescription', 'ticketType', 'priority', 'externalID']
							}
						}
					]
				}
			}
			console.log('RESPONSE:', JSON.stringify(response, null, 2), '\n')
			return res.json(response)
		}

		// Handle tools/call
		if (method === 'tools/call') {
			console.log('TOOL CALL REQUEST:', params.name)
			console.log('Arguments:', JSON.stringify(params.arguments, null, 2))

			// Call the tool handler directly
			if (params.name === 'createTicket') {
				const toolResult = await createTicketHandler(params.arguments)

				const response = {
					jsonrpc: '2.0',
					id,
					result: toolResult
				}
				console.log('📤 RESPONSE:', JSON.stringify(response, null, 2), '\n')
				return res.json(response)
			}

			// Unknown tool
			return res.status(400).json({
				jsonrpc: '2.0',
				id,
				error: {
					code: -32602,
					message: `Unknown tool: ${params.name}`
				}
			})
		}

		// Unknown method
		console.error('✗ Unknown method:', method)
		return res.status(400).json({
			jsonrpc: '2.0',
			id,
			error: {
				code: -32601,
				message: `Method not found: ${method}`
			}
		})
	} catch (error) {
		console.error('\n✗✗✗ ERROR ✗✗✗')
		console.error('Error:', error)
		console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace')

		return res.status(500).json({
			jsonrpc: '2.0',
			id: req.body?.id || null,
			error: {
				code: -32603,
				message: 'Internal error'
			}
		})
	}
})

// Start server
app.listen(PORT, () => {
	console.log('\n=========================================')
	console.log('MCP SERVER STARTED')
	console.log('=========================================')
	console.log(`Port: ${PORT}`)
	console.log(`Environment: ${process.env.AUTOTASK_USERNAME ? '✓ Loaded' : '✗ Missing'}`)
	console.log('Direct JSON-RPC handling - no transport layer')
	console.log('Ready for Retell connections...')
	console.log('=========================================\n')
})
