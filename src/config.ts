/**
 * @fileoverview Application configuration management.
 * Handles environment variable loading and provides a centralized config object
 * for the entire application.
 * @module config
 */
import { configDotenv } from 'dotenv'
import { logger } from './utils/logger.js'

configDotenv({
	path:
		process.env.NODE_ENV === 'test'
			? '.env.test'
			: process.env.NODE_ENV === 'production'
				? '.env'
				: '.env.development',
})

/**
 * Main application configuration interface.
 * Contains server settings, authentication, and Autotask API credentials.
 */
export interface Config {
	/** HTTP server port number */
	port: number
	/** Authentication settings */
	auth: {
		/** Bearer token for MCP endpoint authentication */
		secret: string
	}
	/** Autotask REST API configuration */
	autotask: {
		/** Autotask API hostname (e.g., 'webservices15.autotask.net') */
		hostname: string
		/** API integration tracking code */
		apiIntegrationCode: string
		/** API username */
		username: string
		/** API secret/password */
		secret: string
		/** Default company ID (fallback) */
		companyId: number
	}
	/** BVoip 1Stream API configuration */
	bvoip: {
		/** BVoip API key for authentication */
		apiKey: string
		/** BVoip portal base URL (default: https://portal.1stream.com) */
		baseUrl: string
	}
}

/**
 * Retrieves a required environment variable, exiting the process if not found.
 * Used for critical configuration that the application cannot function without.
 * 
 * @param key - Environment variable name
 * @returns The trimmed environment variable value
 * @internal
 */
function requireEnv(key: string): string {
	const value = process.env[key]?.trim()
	if (!value) {
		logger.fatal({ envVariable: key }, `Missing required environment variable: ${key}`)
		logger.fatal(`Please add ${key} to your .env file`)
		process.exit(1)
	}
	return value
}

/**
 * Retrieves an optional environment variable with a default fallback.
 * 
 * @param key - Environment variable name
 * @param defaultValue - Value to return if env var is not set
 * @returns The environment variable value or default
 * @internal
 */
function getEnv(key: string, defaultValue: string): string {
	return process.env[key]?.trim() || defaultValue
}

/**
 * Retrieves an optional integer environment variable with a default fallback.
 * 
 * @param key - Environment variable name
 * @param defaultValue - Value to return if env var is not set or invalid
 * @returns The parsed integer value or default
 * @internal
 */
function getEnvInt(key: string, defaultValue: number): number {
	const value = process.env[key]?.trim()
	return value ? parseInt(value) : defaultValue
}

/**
 * Global application configuration object.
 * Populated from environment variables at module load time.
 * 
 * @example
 * ```typescript
 * import { config } from './config.js'
 * 
 * console.log(`Server running on port ${config.port}`)
 * console.log(`Autotask host: ${config.autotask.hostname}`)
 * ```
 */
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
		companyId: getEnvInt('AUTOTASK_COMPANY_ID', 0)
	},
	bvoip: {
		apiKey: getEnv('BVOIP_API_KEY', ''),
		baseUrl: getEnv('BVOIP_BASE_URL', 'https://portal.1stream.com')
	}
}


