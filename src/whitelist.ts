/**
 * @fileoverview IP whitelist management for access control.
 * 
 * This module provides IP-based access control by loading allowed IP addresses
 * from a `.whitelist` file and validating incoming requests against that list.
 * Supports both IPv4 and IPv6 addresses, as well as localhost variants.
 * 
 * @module whitelist
 * 
 * @example
 * ```typescript
 * import { loadWhitelist, isWhitelisted, getClientIP } from './whitelist.js'
 * 
 * const whitelist = loadWhitelist()
 * const clientIP = getClientIP(req)
 * if (!isWhitelisted(clientIP, whitelist)) {
 *   res.status(403).send('Forbidden')
 * }
 * ```
 */
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from './utils/logger.js'

/**
 * Path to the whitelist configuration file.
 * Located in the project root directory.
 * @internal
 */
const WHITELIST_FILE = join(process.cwd(), '.whitelist')

/**
 * Loads IP addresses from the `.whitelist` file.
 * 
 * Each line in the file represents one allowed IP address.
 * Lines starting with `#` are treated as comments and ignored.
 * Empty lines are also ignored. If the file doesn't exist,
 * creates an empty whitelist template file.
 * 
 * @returns Array of validated IP addresses
 * 
 * @example
 * ```typescript
 * const whitelist = loadWhitelist()
 * console.log(`Loaded ${whitelist.length} whitelisted IPs`)
 * ```
 */
export function loadWhitelist(): string[] {
	try {
		if (!existsSync(WHITELIST_FILE)) {
			logger.warn({ file: WHITELIST_FILE }, 'No whitelist file found, creating empty whitelist')
			writeFileSync(
				WHITELIST_FILE,
				'# IP Whitelist\n# Add one IP address per line\n# Lines starting with # are comments\n',
				'utf8'
			)
			return []
		}

		const content = readFileSync(WHITELIST_FILE, 'utf8')
		const ips = content
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'))
			.filter((ip) => isValidIP(ip))

		logger.info({ count: ips.length, file: WHITELIST_FILE }, 'Loaded IP addresses from whitelist')
		return ips
	} catch (error) {
		logger.error({ error, file: WHITELIST_FILE }, 'Error loading whitelist file')
		return []
	}
}

/**
 * Checks if an IP address is in the whitelist.
 * 
 * Handles localhost variants by treating them as equivalent:
 * - `127.0.0.1` (IPv4 localhost)
 * - `::1` (IPv6 localhost)
 * - `::ffff:127.0.0.1` (IPv4-mapped IPv6)
 * - `localhost` (hostname)
 * 
 * If any localhost variant is whitelisted, all localhost variants are allowed.
 * 
 * @param ip - IP address to check
 * @param whitelist - Array of whitelisted IP addresses
 * @returns True if the IP is whitelisted
 * 
 * @example
 * ```typescript
 * const whitelist = ['192.168.1.100', '127.0.0.1']
 * isWhitelisted('::1', whitelist) // true (localhost equivalent)
 * isWhitelisted('10.0.0.1', whitelist) // false
 * ```
 */
export function isWhitelisted(ip: string, whitelist: string[]): boolean {
	// Support localhost variations
	const localhostVariants = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']
	if (localhostVariants.includes(ip)) {
		return whitelist.some((whitelistedIp) => localhostVariants.includes(whitelistedIp))
	}

	return whitelist.includes(ip)
}

/**
 * Validates an IP address format.
 * 
 * Supports IPv4 addresses with standard dotted-decimal notation,
 * IPv6 addresses with colon-separated hex notation, and the
 * `localhost` hostname.
 * 
 * @param ip - IP address string to validate
 * @returns True if the IP format is valid
 * @internal
 * 
 * @example
 * ```typescript
 * isValidIP('192.168.1.1')    // true
 * isValidIP('::1')            // true
 * isValidIP('localhost')      // true
 * isValidIP('invalid')        // false
 * isValidIP('999.999.999.999') // false (octet > 255)
 * ```
 */
function isValidIP(ip: string): boolean {
	// IPv4 pattern
	const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
	// IPv6 pattern (simplified)
	const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/

	if (ipv4Pattern.test(ip)) {
		const parts = ip.split('.')
		return parts.every((part) => parseInt(part) >= 0 && parseInt(part) <= 255)
	}

	return ipv6Pattern.test(ip) || ip === 'localhost'
}

import { Request } from 'express'

/**
 * Extracts the client IP address from an Express request.
 * 
 * Checks headers in the following order for proxy support:
 * 1. `X-Forwarded-For` - Standard proxy header (uses first IP if multiple)
 * 2. `X-Real-IP` - Nginx reverse proxy header
 * 3. `req.ip` - Express trust proxy setting
 * 4. `req.socket.remoteAddress` - Direct socket connection
 * 
 * @param req - Express request object
 * @returns Client IP address, or 'unknown' if not determinable
 * 
 * @example
 * ```typescript
 * app.use((req, res, next) => {
 *   const clientIP = getClientIP(req)
 *   logger.info({ clientIP }, 'Request received')
 *   next()
 * })
 * ```
 */
export function getClientIP(req: Request): string {
	// Check various headers for proxy scenarios
	const forwarded = req.headers['x-forwarded-for']
	if (forwarded) {
		const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded
		return ips[0].trim()
	}

	const realIP = req.headers['x-real-ip']
	if (realIP) {
		return typeof realIP === 'string' ? realIP : realIP[0]
	}

	// Fallback to socket IP
	return req.ip || req.socket?.remoteAddress || 'unknown'
}
