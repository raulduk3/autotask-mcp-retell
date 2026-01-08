#!/usr/bin/env node
/**
 * @fileoverview CLI tool to generate Retell AI agent configurations for new tenants.
 * 
 * This script creates a customized agent JSON file by:
 * 1. Reading the agent template and prompt files
 * 2. Substituting company-specific placeholders
 * 3. Injecting MCP server connection details from .env
 * 4. Saving the output to agents/<company-slug>-agent.json
 * 5. Updating .tenants.json with the new tenant
 * 
 * @example
 * ```bash
 * # Interactive mode
 * bun scripts/generate-agent.ts --interactive
 * 
 * # Command-line arguments
 * bun scripts/generate-agent.ts --company "Acme Corp" --companyId 12345 --queueId 67890
 * ```
 * 
 * @module scripts/generate-agent
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'

/**
 * Configuration for generating a Retell agent.
 * Contains all company-specific information needed for the agent template.
 * 
 * @interface AgentConfig
 * @property {string} agentName - Full agent name (e.g., "Acme Corp HelpDesk Agent")
 * @property {string} companyName - Company/tenant name
 * @property {string} companyId - Autotask company ID as string
 * @property {string} queueId - Autotask queue ID as string for ticket routing
 */
interface AgentConfig {
	agentName: string
	companyName: string
	companyId: string
	queueId: string
}

/**
 * Environment configuration loaded from .env file.
 * Contains MCP server connection details for the agent.
 * 
 * @interface EnvConfig
 * @property {string} mcpServerUrl - Full URL to the MCP server endpoint
 * @property {string} mcpAuthSecret - Bearer token for MCP authentication
 * @property {string} mcpId - Static MCP identifier
 */
interface EnvConfig {
	mcpServerUrl: string
	mcpAuthSecret: string
	mcpId: string
}

/**
 * Path to the agent template JSON file.
 * @const {string}
 */
const TEMPLATE_PATH = join(process.cwd(), 'agent-template.json')

/**
 * Path to the agent system prompt markdown file.
 * @const {string}
 */
const PROMPT_PATH = join(process.cwd(), 'retell-agent-prompt.md')

/**
 * Output directory for generated agent configurations.
 * @const {string}
 */
const OUTPUT_DIR = join(process.cwd(), 'scripts', 'agents')

/**
 * Path to the environment file for MCP configuration.
 * @const {string}
 */
const ENV_PATH = join(process.cwd(), '.env.development')

/**
 * Loads MCP configuration from the .env file.
 * 
 * Parses environment variables for MCP server URL, auth secret, and ID.
 * Uses sensible defaults when values are not found.
 * 
 * @function loadEnvConfig
 * @returns {EnvConfig} Parsed environment configuration
 */
function loadEnvConfig(): EnvConfig {
	let mcpAuthSecret = ''
	let mcpServerUrl = ''
	let mcpId = 'mcp-autotask'
	
	// Helper to strip surrounding quotes from env values
	const stripQuotes = (value: string): string => {
		return value.trim().replace(/^["']|["']$/g, '')
	}
	
	if (existsSync(ENV_PATH)) {
		const envContent = readFileSync(ENV_PATH, 'utf8')
		
		const secretMatch = envContent.match(/^MCP_AUTH_SECRET=(.+)$/m)
		if (secretMatch) {
			mcpAuthSecret = stripQuotes(secretMatch[1])
		}
		
		const urlMatch = envContent.match(/^MCP_SERVER_URL=(.+)$/m)
		if (urlMatch) {
			mcpServerUrl = stripQuotes(urlMatch[1])
		}
		
		const idMatch = envContent.match(/^MCP_ID=(.+)$/m)
		if (idMatch) {
			mcpId = stripQuotes(idMatch[1])
		}
	}
	
	return {
		mcpServerUrl: mcpServerUrl || 'https://your-server.example.com/mcp',
		mcpAuthSecret,
		mcpId
	}
}

/**
 * Converts a string to a URL-safe slug.
 * 
 * Transforms company names into lowercase, hyphen-separated identifiers
 * suitable for filenames and URLs.
 * 
 * @function slugify
 * @param {string} text - Input text to slugify
 * @returns {string} URL-safe slug
 * 
 * @example
 * slugify('Acme Corp Inc.') // Returns 'acme-corp-inc'
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

/**
 * Generates a Retell agent configuration from template.
 * 
 * Reads the template and prompt files, then substitutes all
 * placeholder values with company-specific and environment configuration.
 * 
 * Placeholders replaced:
 * - `__AGENT_NAME__` - Full agent name
 * - `__COMPANY_NAME__` - Company name
 * - `__COMPANY_ID__` - Autotask company ID
 * - `__QUEUE_ID__` - Autotask queue ID
 * - `__MCP_SERVER_URL__` - MCP endpoint URL
 * - `__MCP_AUTH_SECRET__` - MCP authentication token
 * - `__MCP_ID__` - MCP identifier
 * - `__AGENT_PROMPT__` - Escaped prompt content
 * 
 * @function generateAgent
 * @param {AgentConfig} config - Agent configuration with company details
 * @param {EnvConfig} envConfig - Environment configuration with MCP settings
 * @returns {string} Generated agent JSON as string
 * @throws {Error} Exits process if template or prompt files are missing
 */
function generateAgent(config: AgentConfig, envConfig: EnvConfig): string {
	if (!existsSync(TEMPLATE_PATH)) {
		console.error(`Error: Template not found at ${TEMPLATE_PATH}`)
		process.exit(1)
	}
	
	if (!existsSync(PROMPT_PATH)) {
		console.error(`Error: Prompt file not found at ${PROMPT_PATH}`)
		process.exit(1)
	}
	
	const templateContent = readFileSync(TEMPLATE_PATH, 'utf8')
	let promptContent = readFileSync(PROMPT_PATH, 'utf8')
	
	// Replace placeholders in prompt content BEFORE escaping
	promptContent = promptContent
		.replace(/__COMPANY_NAME__/g, config.companyName)
	
	// Escape the prompt for JSON embedding (handle newlines, quotes, backslashes)
	const escapedPrompt = promptContent
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '')
		.replace(/\t/g, '\\t')
	
	// Replace __VAR__ placeholders (not Retell's {{dynamic_variables}})
	let output = templateContent
		.replace(/__AGENT_NAME__/g, config.agentName)
		.replace(/__COMPANY_NAME__/g, config.companyName)
		.replace(/__COMPANY_ID__/g, config.companyId)
		.replace(/__QUEUE_ID__/g, config.queueId)
		.replace(/__MCP_SERVER_URL__/g, envConfig.mcpServerUrl)
		.replace(/__MCP_AUTH_SECRET__/g, envConfig.mcpAuthSecret)
		.replace(/__MCP_ID__/g, envConfig.mcpId)
		.replace(/__AGENT_PROMPT__/g, escapedPrompt)
	
	return output
}

/**
 * Saves the generated agent configuration to the output directory.
 * 
 * Creates the output directory if it doesn't exist, then writes
 * the agent JSON to a file named after the slugified company name.
 * 
 * @function saveAgent
 * @param {AgentConfig} config - Agent configuration (used for filename)
 * @param {string} content - Generated JSON content to save
 * @returns {string} Absolute path to the saved file
 */
function saveAgent(config: AgentConfig, content: string): string {
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true })
	}
	
	const filename = `${slugify(config.companyName)}-agent.json`
	const filepath = join(OUTPUT_DIR, filename)
	
	writeFileSync(filepath, content, 'utf8')
	return filepath
}

/**
 * Adds or updates a tenant in the .tenants.json file.
 * 
 * The tenants file is used by the MCP server to validate incoming
 * requests and route tickets to the correct Autotask queue.
 * 
 * @function addToTenants
 * @param {string} companyId - Autotask company ID
 * @param {string} queueId - Autotask queue ID
 * @param {string} companyName - Human-readable company name
 */
function addToTenants(companyId: string, queueId: string, companyName: string): void {
	const tenantsPath = join(process.cwd(), '.tenants.json')
	
	let tenants: Array<{ companyId: number; queueId: number; name: string }> = []
	
	if (existsSync(tenantsPath)) {
		const content = readFileSync(tenantsPath, 'utf8')
		tenants = JSON.parse(content)
	}
	
	const companyIdNum = parseInt(companyId)
	const queueIdNum = parseInt(queueId)
	
	// Check if tenant already exists
	const existing = tenants.find(t => t.companyId === companyIdNum)
	if (existing) {
		console.log(`⚠️  Tenant with companyId ${companyId} already exists, updating...`)
		existing.queueId = queueIdNum
		existing.name = companyName
	} else {
		tenants.push({
			companyId: companyIdNum,
			queueId: queueIdNum,
			name: companyName
		})
	}
	
	writeFileSync(tenantsPath, JSON.stringify(tenants, null, 2), 'utf8')
	console.log(`✅ Updated .tenants.json with ${companyName}`)
}

/**
 * Prompts the user for input via readline.
 * 
 * @async
 * @function prompt
 * @param {string} question - Question to display to the user
 * @returns {Promise<string>} User's trimmed input
 */
async function prompt(question: string): Promise<string> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout
	})
	
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close()
			resolve(answer.trim())
		})
	})
}

/**
 * Runs the interactive mode, prompting user for all required values.
 * 
 * @async
 * @function interactiveMode
 * @returns {Promise<AgentConfig>} Collected agent configuration
 */
async function interactiveMode(): Promise<AgentConfig> {
	console.log('\n🤖 Retell Agent Generator\n')
	console.log('Generate a new agent configuration for a company.\n')
	
	const companyName = await prompt('Company name: ')
	const companyId = await prompt('Autotask Company ID: ')
	const queueId = await prompt('Autotask Queue ID: ')
	
	const agentName = `${companyName} Help Desk Ticket Agent`
	
	return {
		agentName,
		companyName,
		companyId,
		queueId
	}
}

/**
 * Parses command-line arguments.
 * 
 * Supports flags:
 * - `--interactive`, `-i`: Use interactive mode
 * - `--help`, `-h`: Show usage information
 * - `--company <name>`: Company name
 * - `--companyId <id>`: Autotask company ID
 * - `--queueId <id>`: Autotask queue ID
 * 
 * @function parseArgs
 * @returns {AgentConfig | null} Parsed config, or null to signal interactive mode
 * @throws {Error} Exits process if required args are missing (non-interactive)
 */
function parseArgs(): AgentConfig | null {
	const args = process.argv.slice(2)
	
	if (args.includes('--interactive') || args.includes('-i')) {
		return null // Signal to use interactive mode
	}
	
	if (args.includes('--help') || args.includes('-h')) {
		console.log(`
Usage: bun scripts/generate-agent.ts [options]

Options:
  --interactive, -i     Interactive mode (prompts for values)
  --company <name>      Company name (required)
  --companyId <id>      Autotask Company ID (required)
  --queueId <id>        Autotask Queue ID (required)
  --help, -h            Show this help

Environment variables (from .env):
  MCP_SERVER_URL        MCP server URL (e.g., ngrok URL)
  MCP_AUTH_SECRET       Authorization header for MCP server
  MCP_ID                Static MCP ID (default: mcp-autotask)

Examples:
  bun scripts/generate-agent.ts --interactive
  bun scripts/generate-agent.ts --company "Acme Corp" --companyId 12345 --queueId 67890

Output:
  agents/<company-slug>-agent.json
`)
		process.exit(0)
	}
	
	const getArg = (name: string): string | undefined => {
		const idx = args.indexOf(`--${name}`)
		return idx !== -1 ? args[idx + 1] : undefined
	}
	
	const companyName = getArg('company')
	const companyId = getArg('companyId')
	const queueId = getArg('queueId')
	
	if (!companyName || !companyId || !queueId) {
		console.error('Error: --company, --companyId, and --queueId are required')
		console.error('Run with --help for usage information')
		process.exit(1)
	}
	
	return {
		agentName: `${companyName} HelpDesk Agent`,
		companyName,
		companyId,
		queueId
	}
}

/**
 * Main entry point for the agent generator CLI.
 * 
 * Orchestrates the generation process:
 * 1. Parses arguments or runs interactive mode
 * 2. Loads environment configuration
 * 3. Generates and saves the agent file
 * 4. Updates the tenants registry
 * 
 * @async
 * @function main
 * @returns {Promise<void>}
 */
async function main() {
	let config = parseArgs()
	
	if (!config) {
		config = await interactiveMode()
	}
	
	const envConfig = loadEnvConfig()
	
	console.log('\n📝 Generating agent configuration...\n')
	console.log(`   Agent Name:    ${config.agentName}`)
	console.log(`   Company:       ${config.companyName}`)
	console.log(`   Company ID:    ${config.companyId}`)
	console.log(`   Queue ID:      ${config.queueId}`)
	console.log(`   MCP URL:       ${envConfig.mcpServerUrl}`)
	console.log(`   MCP ID:        ${envConfig.mcpId}`)
	console.log(`   Auth Secret:   ${envConfig.mcpAuthSecret ? '****' + envConfig.mcpAuthSecret.slice(-4) : '⚠️  NOT SET'}`)
	
	if (!envConfig.mcpAuthSecret) {
		console.warn('\n⚠️  Warning: MCP_AUTH_SECRET not set in .env - agent will not authenticate')
	}
	
	if (envConfig.mcpServerUrl === 'https://your-server.example.com/mcp') {
		console.warn('⚠️  Warning: MCP_SERVER_URL not set in .env - using placeholder')
	}
	
	const content = generateAgent(config, envConfig)
	const filepath = saveAgent(config, content)
	
	console.log(`\n✅ Agent configuration saved to: ${filepath}`)
	
	// Add to tenants file
	addToTenants(config.companyId, config.queueId, config.companyName)
	
	console.log(`
📋 Next steps:
   1. Import ${filepath} into Retell dashboard
   2. Configure the agent's phone number in Retell
   3. Test with a call to verify ticket creation
`)
}

main().catch(console.error)
