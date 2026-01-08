/**
 * @fileoverview Centralized logging configuration using Pino logger.
 * Provides structured JSON logging with redaction of sensitive fields.
 * @module utils/logger
 */
import pino from 'pino'

/**
 * Configured Pino logger instance for the application.
 * 
 * Features:
 * - Configurable log level via `LOG_LEVEL` env var (defaults to 'info')
 * - Pretty-printed output in development via pino-pretty
 * - Automatic redaction of sensitive auth headers and Autotask credentials
 * 
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js'
 * 
 * logger.info({ ticketId: 123 }, 'Ticket created')
 * logger.error({ error }, 'Failed to connect')
 * ```
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    redact: {
        paths: ['req.headers.authorization', 'autotask.secret', 'autotask.apiIntegrationCode'],
        remove: true
    }
})