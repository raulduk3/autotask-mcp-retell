/**
 * @fileoverview Application configuration management and multi-tenant support.
 * Handles environment variable loading, tenant configuration, and provides
 * a centralized config object for the entire application.
 * @module config
 */
import { configDotenv } from 'dotenv'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
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
 * Represents a tenant (customer company) in the multi-tenant system.
 * Each tenant has a unique Autotask company ID and associated queue for ticket routing.
 * 
 * @interface Tenant
 * @property {number} companyId - Unique Autotask company identifier
 * @property {number} queueId - Autotask queue ID for routing tickets to the correct team
 * @property {string} name - Human-readable tenant/company name
 */
export interface Tenant {
	companyId: number
	queueId: number
	name: string
}

/**
 * Main application configuration interface.
 * Contains server settings, authentication, and Autotask API credentials.
 * 
 * @interface Config
 * @property {number} port - HTTP server port number
 * @property {Object} auth - Authentication settings
 * @property {string} auth.secret - Bearer token for MCP endpoint authentication
 * @property {Object} autotask - Autotask REST API configuration
 * @property {string} autotask.hostname - Autotask API hostname (e.g., 'webservices15.autotask.net')
 * @property {string} autotask.apiIntegrationCode - API integration tracking code
 * @property {string} autotask.username - API username
 * @property {string} autotask.secret - API secret/password
 * @property {number} autotask.companyId - Default company ID (fallback)
 * @property {number} autotask.queueId - Default queue ID (fallback)
 */
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
		// Default tenant (fallback for backward compatibility)
		companyId: number
		queueId: number
	}
}

/**
 * Retrieves a required environment variable, exiting the process if not found.
 * Used for critical configuration that the application cannot function without.
 * 
 * @param {string} key - Environment variable name
 * @returns {string} The trimmed environment variable value
 * @throws {never} Calls process.exit(1) if the variable is not set
 * @private
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
 * @param {string} key - Environment variable name
 * @param {string} defaultValue - Value to return if env var is not set
 * @returns {string} The environment variable value or default
 * @private
 */
function getEnv(key: string, defaultValue: string): string {
	return process.env[key]?.trim() || defaultValue
}

/**
 * Retrieves an optional integer environment variable with a default fallback.
 * 
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Value to return if env var is not set or invalid
 * @returns {number} The parsed integer value or default
 * @private
 */
function getEnvInt(key: string, defaultValue: number): number {
	const value = process.env[key]?.trim()
	return value ? parseInt(value) : defaultValue
}

/**
 * Global application configuration object.
 * Populated from environment variables at module load time.
 * 
 * @const {Config}
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
		companyId: getEnvInt('AUTOTASK_COMPANY_ID', 0),
		queueId: getEnvInt('AUTOTASK_QUEUE_ID', 29683498)
	}
}

/**
 * Path to the tenants configuration file.
 * @const {string}
 * @private
 */
const TENANTS_FILE = join(process.cwd(), '.tenants.json')

/**
 * In-memory cache of loaded tenants, keyed by companyId.
 * @type {Map<number, Tenant>}
 * @private
 */
let tenantsCache: Map<number, Tenant> = new Map()

/**
 * Load tenants from .tenants.json file
 */
export function loadTenants(): Map<number, Tenant> {
	try {
		if (!existsSync(TENANTS_FILE)) {
			logger.warn({ file: TENANTS_FILE }, 'No tenants file found, creating with default tenant')
			const defaultTenants: Tenant[] = [
				{
					companyId: config.autotask.companyId,
					queueId: config.autotask.queueId,
					name: 'Default'
				}
			]
			writeFileSync(TENANTS_FILE, JSON.stringify(defaultTenants, null, 2), 'utf8')
			tenantsCache = new Map(defaultTenants.map(t => [t.companyId, t]))
			return tenantsCache
		}

		const content = readFileSync(TENANTS_FILE, 'utf8')
		const tenants: Tenant[] = JSON.parse(content)
		tenantsCache = new Map(tenants.map(t => [t.companyId, t]))
		logger.info({ count: tenantsCache.size, file: TENANTS_FILE }, 'Loaded tenants')
		return tenantsCache
	} catch (error) {
		logger.error({ error, file: TENANTS_FILE }, 'Error loading tenants file')
		// Fall back to default tenant from env
		tenantsCache = new Map([[config.autotask.companyId, {
			companyId: config.autotask.companyId,
			queueId: config.autotask.queueId,
			name: 'Default (fallback)'
		}]])
		return tenantsCache
	}
}

/**
 * Get tenant by company ID
 */
export function getTenant(companyId: number): Tenant | undefined {
	if (tenantsCache.size === 0) {
		loadTenants()
	}
	return tenantsCache.get(companyId)
}

/**
 * Check if a company ID is a valid tenant
 */
export function isValidTenant(companyId: number): boolean {
	if (tenantsCache.size === 0) {
		loadTenants()
	}
	return tenantsCache.has(companyId)
}

/**
 * Get all tenants
 */
export function getAllTenants(): Tenant[] {
	if (tenantsCache.size === 0) {
		loadTenants()
	}
	return Array.from(tenantsCache.values())
}

/**
 * Reload tenants from file (for hot reload)
 */
export function reloadTenants(): Map<number, Tenant> {
	tenantsCache.clear()
	return loadTenants()
}
