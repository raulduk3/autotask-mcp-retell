// src/config.ts
import { configDotenv } from 'dotenv'
import { logger } from './utils/logger.js'

configDotenv({
	path:
		process.env.NODE_ENV === 'test'
			? '.env.test'
			: process.env.NODE_ENV === 'production'
				? '.env.production'
				: '.env.development',
})

interface Config {
	port: number
	auth: {
		secret: string
	}
	autotask: {
		hostname: string
		apiIntegrationCode: string
		username: string
		secret: string
		companyId: number
		queueId: number
	}
}

function requireEnv(key: string): string {
	const value = process.env[key]?.trim()
	if (!value) {
		logger.fatal({ envVariable: key }, `Missing required environment variable: ${key}`)
		logger.fatal(`Please add ${key} to your .env file`)
		process.exit(1)
	}
	return value
}

function getEnv(key: string, defaultValue: string): string {
	return process.env[key]?.trim() || defaultValue
}

function getEnvInt(key: string, defaultValue: number): number {
	const value = process.env[key]?.trim()
	return value ? parseInt(value) : defaultValue
}

export const config: Config = {
	port: parseInt(getEnv('PORT', '3000')),
	auth: {
		secret: getEnv('MCP_AUTH_SECRET', '')
	},
	autotask: {
		hostname: getEnv('AUTOTASK_HOSTNAME', 'webservices15.autotask.net'),
		apiIntegrationCode: requireEnv('AUTOTASK_API_INTEGRATION_CODE'),
		username: requireEnv('AUTOTASK_USERNAME'),
		secret: requireEnv('AUTOTASK_SECRET'),
		companyId: getEnvInt('AUTOTASK_COMPANY_ID', 0),
		queueId: getEnvInt('AUTOTASK_QUEUE_ID', 29683498)
	}
}
