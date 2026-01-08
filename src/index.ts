/**
 * @fileoverview Application entry point with Node.js warning suppression.
 * 
 * This module serves as the bootstrap entry point for the Autotask MCP server.
 * It patches the Node.js warning system to suppress known deprecation warnings
 * from third-party dependencies (specifically the fs.Stats constructor warning
 * from pino-pretty) before loading the main server module.
 * 
 * @module index
 * 
 * @example
 * ```bash
 * # Start the server
 * bun run dev
 * # or
 * npm run start
 * ```
 */

/**
 * Original Node.js warning emitter function.
 * Stored to allow proxying while preserving original behavior for non-suppressed warnings.
 */
const originalEmitWarning = process.emitWarning

/**
 * Overrides Node.js process.emitWarning to suppress known deprecation warnings.
 * 
 * This proxy function intercepts all Node.js warnings and filters out specific
 * deprecation warnings that originate from dependencies we cannot control.
 * All other warnings are passed through to the original handler.
 * 
 * Suppressed warnings:
 * - `fs.Stats constructor is deprecated` - Triggered by pino-pretty's internal usage
 */
process.emitWarning = ((warning: string | Error, ...rest: unknown[]): void => {
	const warningStr = typeof warning === 'string' ? warning : warning.message || ''
	
	// Suppress fs.Stats constructor deprecation (from pino-pretty dependency)
	if (warningStr.includes('fs.Stats constructor is deprecated')) {
		return
	}
	
	// Call original emitWarning for all other warnings
	originalEmitWarning(warning, ...(rest as []))
}) as typeof process.emitWarning

/**
 * Import and start the main server module.
 * This triggers the server initialization and begins listening for connections.
 * @see {@link module:server}
 */
import './server.js'
