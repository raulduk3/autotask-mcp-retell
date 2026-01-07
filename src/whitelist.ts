import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from './utils/logger.js'

const WHITELIST_FILE = join(process.cwd(), '.whitelist')

/**
 * Load IP addresses from the .whitelist file
 * @returns Array of whitelisted IP addresses
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
 * Check if an IP address is in the whitelist
 * @param ip - IP address to check
 * @param whitelist - Array of whitelisted IPs
 * @returns true if IP is whitelisted
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
 * Basic IP address validation
 * @param ip - IP address to validate
 * @returns true if IP format is valid
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
 * Get the client IP address from the request
 * Handles proxies and forwarded headers
 * @param req - Express request object
 * @returns Client IP address
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
