import { Request, Response } from 'express'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { InMemoryEventStore } from './utils/inMemoryEventStore.js'
import { createMcpServer } from './mcp/server.js'
import { loadWhitelist, isWhitelisted, getClientIP } from './whitelist.js'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

const PORT = config.port
const AUTH_SECRET = config.auth.secret
const IP_WHITELIST = loadWhitelist()

// Create singleton MCP server instance (reused across all sessions)
const mcpServer = createMcpServer()
logger.info('MCP server instance created')

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}
const sessionCreatedAt: { [sessionId: string]: number } = {}
const SESSION_TIMEOUT_MS = 15 * 60 * 1000

// Cleanup inactive sessions periodically
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
}, 60 * 1000) // Check every minute

// Monitor server health and report periodically
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
}, 2 * 60 * 1000) // Report every 2 minutes

// Middleware to validate IP whitelist
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

// Middleware to validate auth header
function validateAuth(req: Request, res: Response, next: () => void): void {
	if (AUTH_SECRET && req.headers['authorization'] !== AUTH_SECRET) {
		res.status(401).json({
			jsonrpc: '2.0',
			error: { code: -32000, message: 'Unauthorized' },
			id: null
		})
		return
	}
	next()
}

const app = express()

// Log all incoming requests for debugging
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

app.use(express.json())

// Validate request body for JSON-RPC
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

// MCP POST endpoint
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

// GET endpoint for SSE streaming
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
	} catch (error) {
		logger.error({ error, sessionId }, 'SSE error')
		if (!res.headersSent) {
			res.status(500).send('Internal error')
		}
	}
})

// DELETE endpoint for session termination
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

// Catch-all route to deny all other traffic
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

async function shutdown(signal: string) {
	logger.info({ signal, sessions: Object.keys(transports).length }, 'Shutting down')

	for (const sessionId in transports) {
		try {
			await transports[sessionId].close()
		} catch (error) {
			logger.error({ sessionId }, 'Error closing transport')
		}
	}

	server.close(() => process.exit(0))
	setTimeout(() => process.exit(1), 10000)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
