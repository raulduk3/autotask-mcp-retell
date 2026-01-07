/**
 * Entry point that suppresses known deprecation warnings from dependencies
 */

// Suppress specific Node.js warnings before any imports
const originalEmitWarning = process.emitWarning

// Override emitWarning to suppress known deprecation warnings from dependencies
// Using type assertion due to complex function overloads
process.emitWarning = ((warning: string | Error, ...rest: unknown[]): void => {
	const warningStr = typeof warning === 'string' ? warning : warning.message || ''
	
	// Suppress fs.Stats constructor deprecation (from pino-pretty dependency)
	if (warningStr.includes('fs.Stats constructor is deprecated')) {
		return
	}
	
	// Call original emitWarning for all other warnings
	originalEmitWarning(warning, ...(rest as []))
}) as typeof process.emitWarning

// Now import and start the server
import './server.js'
