/**
 * @fileoverview Main MCP HTTP server with session management, authentication, and SSE streaming.
 * 
 * This server implements the Model Context Protocol (MCP) over HTTP with:
 * - Streamable HTTP transport with Server-Sent Events (SSE)
 * - Session-based state management with automatic cleanup
 * - IP whitelist and Bearer token authentication
 * - Health monitoring and memory reporting
 * 
 * @module server
 */
import { Request, Response } from 'express'
import express from 'express'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { InMemoryEventStore } from './utils/inMemoryEventStore.js'
import { createMcpServer } from './mcp/server.js'
import { loadWhitelist, isWhitelisted, getClientIP } from './whitelist.js'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

/**
 * HTTP server port from configuration.
 * @const {number}
 */
const PORT = config.port

/**
 * Bearer token for MCP endpoint authentication.
 * Empty string disables authentication.
 * @const {string}
 */
const AUTH_SECRET = config.auth.secret

/**
 * Loaded IP whitelist from .whitelist file.
 * Empty array disables IP filtering.
 * @const {string[]}
 */
const IP_WHITELIST = loadWhitelist()

/**
 * Singleton MCP server instance shared across all sessions.
 * Reusing a single instance reduces memory overhead.
 * @const {McpServer}
 */
const mcpServer = createMcpServer()
logger.info('MCP server instance created')

/**
 * Active session transports keyed by session ID.
 * Each session has its own StreamableHTTPServerTransport for SSE streaming.
 * @type {Object.<string, StreamableHTTPServerTransport>}
 */
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

/**
 * Session creation timestamps for TTL enforcement.
 * @type {Object.<string, number>}
 */
const sessionCreatedAt: { [sessionId: string]: number } = {}

/**
 * Session timeout in milliseconds (15 minutes).
 * Sessions inactive longer than this are automatically cleaned up.
 * @const {number}
 */
const SESSION_TIMEOUT_MS = 15 * 60 * 1000

/**
 * Maximum concurrent sessions allowed.
 * Returns 503 when limit is reached to prevent memory exhaustion.
 * @const {number}
 */
const MAX_SESSIONS = 100

/**
 * Periodic cleanup of expired sessions.
 * Runs every 60 seconds to remove sessions older than SESSION_TIMEOUT_MS.
 * Closes transports gracefully before removal.
 */
setInterval(() => {
	const now = Date.now()
	const sessionsToRemove: string[] = []

	for (const sessionId in sessionCreatedAt) {
		const age = now - sessionCreatedAt[sessionId]
		if (age > SESSION_TIMEOUT_MS) {
			sessionsToRemove.push(sessionId)
		}
	}

	if (sessionsToRemove.length > 0) {
		logger.info(
			{
				count: sessionsToRemove.length,
				remainingTransports: Object.keys(transports).length - sessionsToRemove.length
			},
			'Cleaning up expired sessions'
		)
		
		for (const sessionId of sessionsToRemove) {
			const transport = transports[sessionId]
			if (transport) {
				transport.close()
				delete transports[sessionId]
			}
			delete sessionCreatedAt[sessionId]
		}
	}
}, 60 * 1000)

/**
 * Periodic health monitoring and reporting.
 * Runs every 2 minutes to log server status including:
 * - Active session count and ages
 * - Memory usage (heap, RSS, external)
 * - Server uptime
 */
setInterval(() => {
	const memUsage = process.memoryUsage()
	const now = Date.now()
	const sessionDetails: { [sessionId: string]: { age: number; ageMinutes: number } } = {}

	for (const sessionId in sessionCreatedAt) {
		const age = now - sessionCreatedAt[sessionId]
		sessionDetails[sessionId] = {
			age,
			ageMinutes: Math.floor(age / 1000 / 60)
		}
	}

	logger.info(
		{
			activeSessions: Object.keys(transports).length,
			sessionDetails,
			memory: {
				heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
				heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
				rssMB: Math.round(memUsage.rss / 1024 / 1024),
				externalMB: Math.round(memUsage.external / 1024 / 1024)
			},
			uptime: Math.floor(process.uptime() / 60) + 'm'
		},
		'Server health report'
	)
}, 2 * 60 * 1000)

/**
 * Express middleware to validate client IP against the whitelist.
 * 
 * If the whitelist is non-empty, requests from non-whitelisted IPs
 * receive a 403 Forbidden response. Supports proxy headers.
 * 
 * @function validateIPWhitelist
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 * @returns {void}
 */
function validateIPWhitelist(req: Request, res: Response, next: () => void): void {
	const clientIP = getClientIP(req)

	logger.debug({ clientIP, method: req.method, path: req.path }, 'Request from IP')

	if (IP_WHITELIST.length > 0 && !isWhitelisted(clientIP, IP_WHITELIST)) {
		logger.warn({ clientIP, method: req.method, path: req.path }, 'IP not whitelisted - blocked')
		res.status(403).json({
			jsonrpc: '2.0',
			error: { code: -32000, message: 'Forbidden' },
			id: null
		})
		return
	}
	next()
}

/**
 * Express middleware to validate Bearer token authentication.
 * 
 * Uses timing-safe comparison to prevent timing attacks.
 * If AUTH_SECRET is empty, authentication is disabled.
 * Accepts both "Bearer TOKEN" and raw "TOKEN" formats for flexibility.
 * 
 * @function validateAuth
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 * @returns {void}
 */
function validateAuth(req: Request, res: Response, next: () => void): void {
	if (AUTH_SECRET) {
		const authHeader = req.headers['authorization'] || ''
		// Extract token from "Bearer TOKEN" format, or use raw value if no prefix
		const provided = String(authHeader).startsWith('Bearer ') 
			? String(authHeader).slice(7) 
			: String(authHeader)
		const providedBuffer = Buffer.from(provided)
		const secretBuffer = Buffer.from(AUTH_SECRET)
		
		if (providedBuffer.length !== secretBuffer.length || !timingSafeEqual(providedBuffer, secretBuffer)) {
			res.status(401).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Unauthorized' },
				id: null
			})
			return
		}
	}
	next()
}

/**
 * Express application instance.
 * @const {express.Application}
 */
const app = express()

/**
 * Request logging middleware.
 * Logs all incoming requests with method, path, session ID, and auth status.
 */
app.use((req, res, next) => {
	logger.info(
		{
			method: req.method,
			path: req.path,
			sessionId: req.headers['mcp-session-id'] || 'none',
			authorization: req.headers['authorization'] ? 'present' : 'missing'
		},
		'Incoming HTTP request'
	)
	next()
})

app.use(express.json({ limit: '50kb' }))

/**
 * Validates incoming JSON-RPC request body structure.
 * Ensures requests have valid JSON-RPC 2.0 format with method field.
 * 
 * @function validateRequestBody
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 * @returns {void}
 */
function validateRequestBody(req: Request, res: Response, next: () => void): void {
	if (!req.body?.jsonrpc || req.body.jsonrpc !== '2.0' || !req.body.method) {
		res.status(400).json({
			jsonrpc: '2.0',
			error: { code: -32600, message: 'Invalid Request' },
			id: req.body?.id || null
		})
		return
	}
	next()
}

/**
 * POST /mcp - Main MCP endpoint for JSON-RPC requests.
 * 
 * Handles:
 * - Session initialization (creates new transport)
 * - Tool calls and other MCP methods (uses existing transport)
 * 
 * Headers:
 * - `mcp-session-id`: Session identifier (required after initialization)
 * - `Authorization`: Bearer token (if AUTH_SECRET is set)
 * 
 * @route POST /mcp
 */
app.post('/mcp', validateIPWhitelist, validateAuth, validateRequestBody, async (req: Request, res: Response) => {
	const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined

	logger.info(
		{
			method: req.body.method,
			sessionId: sessionIdHeader || 'none',
			id: req.body.id
		},
		'MCP request received'
	)

	try {
		if (isInitializeRequest(req.body)) {
			// Check max sessions before creating new one
			if (Object.keys(transports).length >= MAX_SESSIONS) {
				logger.warn({ activeSessions: Object.keys(transports).length }, 'Max sessions reached')
				res.status(503).json({
					jsonrpc: '2.0',
					error: { code: -32000, message: 'Server busy, try again later' },
					id: null
				})
				return
			}

			logger.info('Initializing new session')

			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				eventStore: new InMemoryEventStore(),
				onsessioninitialized: sessionId => {
					logger.info({ sessionId }, 'Session initialized - transport stored')
					transports[sessionId] = transport
					sessionCreatedAt[sessionId] = Date.now()
				}
			})

			transport.onclose = () => {
				const sid = transport.sessionId
				if (sid && transports[sid]) {
					logger.info({ sessionId: sid }, 'Transport closed - cleaning up')
					delete transports[sid]
					delete sessionCreatedAt[sid]
				}
			}

			logger.info('Connecting transport to MCP server')
			await mcpServer.connect(transport)
			logger.info('Handling initialize request')
			await transport.handleRequest(req, res, req.body)
			return
		}

		if (!sessionIdHeader || !transports[sessionIdHeader]) {
			logger.warn(
				{
					sessionId: sessionIdHeader || 'missing',
					activeSessions: Object.keys(transports).length,
					method: req.body.method
				},
				'Invalid or missing session ID'
			)
			res.status(400).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Invalid session' },
				id: req.body.id || null
			})
			return
		}

		logger.info(
			{ sessionId: sessionIdHeader, method: req.body.method },
			'Handling request with existing transport'
		)
		await transports[sessionIdHeader].handleRequest(req, res, req.body)
		sessionCreatedAt[sessionIdHeader] = Date.now()
	} catch (error) {
		logger.error(
			{
				error,
				stack: error instanceof Error ? error.stack : undefined,
				sessionId: sessionIdHeader,
				method: req.body?.method
			},
			'MCP request error'
		)
		if (!res.headersSent) {
			res.status(500).json({
				jsonrpc: '2.0',
				error: { code: -32603, message: 'Internal error' },
				id: req.body?.id || null
			})
		}
	}
})

/**
 * GET /mcp - Server-Sent Events (SSE) streaming endpoint.
 * 
 * Establishes a persistent SSE connection for receiving server-initiated
 * messages. Supports reconnection via Last-Event-ID header.
 * 
 * Headers:
 * - `mcp-session-id`: Session identifier (required)
 * - `last-event-id`: For SSE reconnection (optional)
 * 
 * @route GET /mcp
 */
app.get('/mcp', validateIPWhitelist, validateAuth, async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined

	logger.info(
		{
			sessionId: sessionId || 'missing',
			activeSessions: Object.keys(transports).length,
			lastEventId: req.headers['last-event-id']
		},
		'SSE connection request'
	)

	if (!sessionId || !transports[sessionId]) {
		logger.warn(
			{ sessionId: sessionId || 'missing', activeSessions: Object.keys(transports).length },
			'SSE request with invalid session'
		)
		res.status(400).send('Invalid session')
		return
	}

	const lastEventId = req.headers['last-event-id'] as string | undefined
	if (lastEventId) {
		logger.info({ sessionId, lastEventId }, 'SSE reconnection attempt')
	} else {
		logger.info({ sessionId }, 'New SSE stream establishing')
	}

	try {
		await transports[sessionId].handleRequest(req, res)
		// Refresh session on SSE activity
		sessionCreatedAt[sessionId] = Date.now()
	} catch (error) {
		logger.error({ error, sessionId }, 'SSE error')
		if (!res.headersSent) {
			res.status(500).send('Internal error')
		}
	}
})

/**
 * DELETE /mcp - Session termination endpoint.
 * 
 * Gracefully closes the session transport and removes it from memory.
 * Returns 200 OK even if session doesn't exist (idempotent).
 * 
 * Headers:
 * - `mcp-session-id`: Session identifier to terminate
 * 
 * @route DELETE /mcp
 */
app.delete('/mcp', validateIPWhitelist, validateAuth, async (req: Request, res: Response) => {
	const sessionId = req.headers['mcp-session-id'] as string | undefined
	const transport = transports[sessionId!]

	if (!sessionId || !transport) {
		res.status(200).send('OK')
		return
	}

	logger.info({ sessionId }, 'Terminating session')

	try {
		await transport.handleRequest(req, res)
		transport.close()
		delete transports[sessionId]
		delete sessionCreatedAt[sessionId]
		logger.info(
			{ sessionId, remainingTransports: Object.keys(transports).length },
			'Session terminated'
		)
	} catch (error) {
		logger.error({ error, sessionId }, 'Termination error')
		if (!res.headersSent) {
			res.status(500).send('Internal error')
		}
	}
})

/**
 * GET /health - Health check endpoint.
 * 
 * Returns server status including:
 * - Active session count
 * - Memory usage
 * - Uptime
 * 
 * @route GET /health
 * @returns {Object} Health status JSON
 */
app.get('/health', (req: Request, res: Response) => {
	const memUsage = process.memoryUsage()
	res.json({
		status: 'ok',
		sessions: Object.keys(transports).length,
		maxSessions: MAX_SESSIONS,
		uptime: Math.floor(process.uptime()),
		memory: {
			heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
			heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
		}
	})
})

/**
 * Catch-all route for unauthorized endpoints.
 * Returns 404 for any path not explicitly defined.
 */
app.use((req, res) => {
	logger.warn(
		{
			method: req.method,
			path: req.path,
			ip: getClientIP(req)
		},
		'Blocked request to unauthorized endpoint'
	)
	res.status(404).json({
		jsonrpc: '2.0',
		error: { code: -32601, message: 'Not Found' },
		id: null
	})
})

/**
 * HTTP server instance.
 * @const {http.Server}
 */
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

/**
 * Graceful shutdown handler.
 * 
 * Closes all active session transports and waits for the HTTP server
 * to finish handling pending requests before exiting.
 * 
 * @async
 * @function shutdown
 * @param {string} signal - The signal that triggered shutdown (SIGINT or SIGTERM)
 * @returns {Promise<void>}
 */
async function shutdown(signal: string) {
	logger.info({ signal, sessions: Object.keys(transports).length }, 'Shutting down')

	for (const sessionId in transports) {
		try {
			await transports[sessionId].close()
		} catch {
			logger.error({ sessionId }, 'Error closing transport')
		}
	}

	server.close(() => process.exit(0))
	setTimeout(() => process.exit(1), 10000)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
