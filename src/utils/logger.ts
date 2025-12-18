// src/utils/logger.ts
import pino from 'pino'

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