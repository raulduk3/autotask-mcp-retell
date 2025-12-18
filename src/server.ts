/**
 * Memory-Conscious MCP Server for Retell AI
 * 
 * Architecture:
 * - Stateful session management with UUID-based session IDs
 * - Singleton MCP server instance (memory efficient, reused across all sessions)
 * - Transport map for session state tracking and proper cleanup
 * - Three endpoints: POST (init/tools), GET (SSE streaming), DELETE (termination)
 * 
 * Key Features:
 * - Session Management: Each client gets a unique session with state preservation
 * - Memory Management: Single server instance + transport cleanup on close
 * - Resumability: SSE supports Last-Event-ID header for reconnection
 * - Error Handling: Proper JSON-RPC error codes (-32000, -32603, -32600)
 * - Security: IP whitelist + bearer token authentication
 * 
 * Flow:
 * 1. Client sends initialize request (POST /mcp) → Server generates session ID
 * 2. Client includes session ID in subsequent requests (mcp-session-id header)
 * 3. Client establishes SSE connection (GET /mcp) for streaming responses
 * 4. Client terminates session (DELETE /mcp) → Transport cleanup
 * 
 * Based on MCP TypeScript SDK reference: 
 * https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/server/simpleStreamableHttp.ts
 */

import { Request, Response } from 'express'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from './mcp/server.js'
import { loadWhitelist, isWhitelisted, getClientIP } from './whitelist.js'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

const PORT = config.port
const AUTH_SECRET = config.auth.secret
const IP_WHITELIST = loadWhitelist()

// Map to store transports by session ID - enables stateful connections and memory management
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

// Create singleton MCP server instance (memory efficient - reused across all sessions)
const mcpServer = createMcpServer()

// Middleware to validate IP whitelist
function validateIPWhitelist(req: Request, res: Response, next: () => void): void {
	const clientIP = getClientIP(req)

	logger.info({ clientIP }, 'Request received')

	if (IP_WHITELIST.length > 0 && !isWhitelisted(clientIP, IP_WHITELIST)) {
		logger.warn(
			{
				clientIP,
				method: req.method,
				path: req.path,
				userAgent: req.headers['user-agent'] || 'unknown'
			},
			'Unknown IP attempting connection - blocked'
		)

		res.status(403).json({
			jsonrpc: '2.0',
			error: {
				code: -32000,
				message: 'Forbidden: IP not whitelisted'
			},
			id: null
		})
		return
	}

	if (IP_WHITELIST.length > 0) {
		logger.debug('IP whitelisted')
	}

	next()
}

// Middleware to validate auth header
function validateAuth(req: Request, res: Response, next: () => void): void {
	if (AUTH_SECRET) {
		const authHeader = req.headers['authorization']

		if (!authHeader || authHeader !== AUTH_SECRET) {
			logger.warn({ hasAuthHeader: !!authHeader }, 'Authentication failed')
			res.status(401).json({
				jsonrpc: '2.0',
				error: {
					code: -32000,
					message: 'Unauthorized'
				},
				id: null
			})
			return
		}
		logger.debug('Authentication passed')
	}
	next()
}

const app = express()
app.use(express.json())

// Validate request body exists and is valid JSON-RPC
function validateRequestBody(req: Request, res: Response, next: () => void): void {
	if (!req.body || typeof req.body !== 'object') {
		logger.warn('Invalid request body')
		res.status(400).json({
			jsonrpc: '2.0',
			error: {
				code: -32600, // Invalid Request
				message: 'Invalid Request: Body must be valid JSON-RPC'
			},
			id: null
		})
		return
	}

	// Validate required JSON-RPC fields
	if (!req.body.jsonrpc || req.body.jsonrpc !== '2.0') {
		logger.warn('Missing or invalid jsonrpc field')
		res.status(400).json({
			jsonrpc: '2.0',
			error: {
				code: -32600,
				message: 'Invalid Request: jsonrpc field must be "2.0"'
			},
			id: req.body.id || null
		})
		return
	}

	if (!req.body.method || typeof req.body.method !== 'string') {
		logger.warn('Missing or invalid method field')
		res.status(400).json({
			jsonrpc: '2.0',
			error: {
				code: -32600,
				message: 'Invalid Request: method field is required'
			},
			id: req.body.id || null
		})
		return
	}

	next()
}

// MCP POST endpoint - stateful session management
app.post('/mcp', validateIPWhitelist, validateAuth, validateRequestBody, async (req: Request, res: Response) => {
	const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined

	logger.info(
		{
			method: req.body.method,
			id: req.body.id,
			sessionId: sessionIdHeader || 'none',
			hasParams: !!req.body.params
		},
		'MCP request received'
	)

	try {
		// Check if this is an initialization request
		if (isInitializeRequest(req.body)) {
			// Generate new session ID for initialization
			const sessionId = randomUUID()
			logger.info({ sessionId }, 'Initializing new session')

			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => sessionId
			})

			// Set up onclose handler to clean up transport when closed
			transport.onclose = () => {
				const sid = transport.sessionId
				if (sid && transports[sid]) {
					logger.info({ sessionId: sid }, 'Transport closed, removing from memory')
					delete transports[sid]
				}
			}

			// Connect transport to the singleton MCP server (memory efficient)
			await mcpServer.connect(transport)
			
			// Store transport immediately after connection for this session
			transports[sessionId] = transport
			logger.debug({ sessionId }, 'Transport stored for session')
			
			await transport.handleRequest(req, res, req.body)
			return
		}

		// For non-initialization requests, validate session ID
		if (!sessionIdHeader) {
			logger.warn('Missing session ID for non-initialization request')
			res.status(400).json({
				jsonrpc: '2.0',
				error: {
					code: -32000, // Server error (custom)
					message: 'Bad Request: No valid session ID provided'
				},
				id: req.body.id || null
			})
			return
		}

		// Retrieve existing transport
		const transport = transports[sessionIdHeader]
		if (!transport) {
			logger.warn({ sessionId: sessionIdHeader }, 'Invalid or expired session ID')
			res.status(400).json({
				jsonrpc: '2.0',
				error: {
					code: -32000,
					message: 'Bad Request: Invalid or expired session ID'
				},
				id: req.body.id || null
			})
			return
		}

		// Handle the request with existing transport
		await transport.handleRequest(req, res, req.body)
	} catch (error) {
		logger.error(
			{ 
				error, 
				stack: error instanceof Error ? error.stack : undefined,
				sessionId: sessionIdHeader
			},
			'Error handling MCP request'
		)
		if (!res.headersSent) {
			res.status(500).json({
				jsonrpc: '2.0',
				error: {
					code: -32603, // Internal error
					message: 'Internal server error'
				},
				id: req.body?.id || null
			})
		}
	}
})

// GET endpoint for Server-Sent Events (SSE) - enables streaming responses
app.get('/mcp', validateIPWhitelist, validateAuth, async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined

	if (!sessionId) {
		logger.warn('GET request missing session ID')
		res.status(400).send('Bad Request: Missing session ID')
		return
	}

	const transport = transports[sessionId]
	if (!transport) {
		logger.warn({ sessionId }, 'GET request with invalid or expired session ID')
		res.status(400).send('Bad Request: Invalid or expired session ID')
		return
	}

	// Check for Last-Event-ID header for resumability
	const lastEventId = req.headers['last-event-id'] as string | undefined
	if (lastEventId) {
		logger.info({ sessionId, lastEventId }, 'Client reconnecting with Last-Event-ID')
	} else {
		logger.info({ sessionId }, 'Establishing new SSE stream')
	}

	try {
		await transport.handleRequest(req, res)
	} catch (error) {
		logger.error(
			{ error, sessionId, stack: error instanceof Error ? error.stack : undefined },
			'Error handling SSE request'
		)
		if (!res.headersSent) {
			res.status(500).send('Internal server error')
		}
	}
})

// DELETE endpoint for session termination
app.delete('/mcp', validateIPWhitelist, validateAuth, async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined

	if (!sessionId) {
		logger.warn('DELETE request missing session ID')
		res.status(400).json({
			jsonrpc: '2.0',
			error: {
				code: -32600,
				message: 'Bad Request: Missing session ID'
			},
			id: null
		})
		return
	}

	const transport = transports[sessionId]
	if (!transport) {
		logger.warn({ sessionId }, 'DELETE request with unknown session ID')
		// Not an error - session may already be closed
		res.status(200).send('OK')
		return
	}

	logger.info({ sessionId }, 'Terminating session')

	try {
		await transport.handleRequest(req, res)
		// Clean up transport after successful DELETE
		transport.close()
		delete transports[sessionId]
		logger.info({ sessionId }, 'Session terminated and cleaned up')
	} catch (error) {
		logger.error(
			{ error, sessionId, stack: error instanceof Error ? error.stack : undefined },
			'Error handling session termination'
		)
		if (!res.headersSent) {
			res.status(500).send('Error processing session termination')
		}
	}
})

// Start server
const server = app.listen(PORT, () => {
	logger.info(
		{
			port: PORT,
			auth: AUTH_SECRET ? 'enabled' : 'disabled',
			ipWhitelist: IP_WHITELIST.length > 0 ? `enabled (${IP_WHITELIST.length} IPs)` : 'disabled',
			autotaskConfigured: !!config.autotask.username
		},
		'MCP server started'
	)
})

// Handle server shutdown with proper cleanup
async function shutdown(signal: string) {
	logger.info({ signal, activeSessions: Object.keys(transports).length }, 'Shutdown signal received')

	// Close all active transports to properly clean up resources
	for (const sessionId in transports) {
		try {
			logger.info({ sessionId }, 'Closing transport')
			transports[sessionId].close()
			delete transports[sessionId]
		} catch (error) {
			logger.error({ error, sessionId }, 'Error closing transport during shutdown')
		}
	}

	server.close(() => {
		logger.info('HTTP server closed, all sessions cleaned up')
		process.exit(0)
	})

	// Force close after 10 seconds
	setTimeout(() => {
		logger.error('Forced shutdown after timeout')
		process.exit(1)
	}, 10000)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
