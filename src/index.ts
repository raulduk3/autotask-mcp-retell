/**
 * Entry point that suppresses known deprecation warnings from dependencies
 */

// Suppress specific Node.js warnings before any imports
const originalEmitWarning = process.emitWarning
process.emitWarning = function (warning: string | Error, ...args: any[]) {
	const warningStr = typeof warning === 'string' ? warning : warning.message || ''
	
	// Suppress fs.Stats constructor deprecation (from pino-pretty dependency)
	if (warningStr.includes('fs.Stats constructor is deprecated')) {
		return
	}
	
	// Call original emitWarning for all other warnings
	return originalEmitWarning.call(this, warning, ...args)
}

// Now import and start the server
import './server.js'
