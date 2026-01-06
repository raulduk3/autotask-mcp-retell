#!/usr/bin/env node
/**
 * Generate a new Retell agent configuration for a company
 * 
 * Usage:
 *   bun scripts/generate-agent.ts --company "Acme Corp" --companyId 12345 --queueId 67890
 *   bun scripts/generate-agent.ts --interactive
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'

interface AgentConfig {
	agentName: string
	companyName: string
	companyId: string
	queueId: string
}

interface EnvConfig {
	mcpServerUrl: string
	mcpAuthSecret: string
	mcpId: string
}

const TEMPLATE_PATH = join(process.cwd(), 'agent-template.json')
const PROMPT_PATH = join(process.cwd(), 'retell-agent-prompt.md')
const OUTPUT_DIR = join(process.cwd(), 'agents')
const ENV_PATH = join(process.cwd(), '.env')

function loadEnvConfig(): EnvConfig {
	let mcpAuthSecret = ''
	let mcpServerUrl = ''
	let mcpId = 'mcp-autotask'
	
	if (existsSync(ENV_PATH)) {
		const envContent = readFileSync(ENV_PATH, 'utf8')
		
		const secretMatch = envContent.match(/^MCP_AUTH_SECRET=(.+)$/m)
		if (secretMatch) {
			mcpAuthSecret = secretMatch[1].trim()
		}
		
		const urlMatch = envContent.match(/^MCP_SERVER_URL=(.+)$/m)
		if (urlMatch) {
			mcpServerUrl = urlMatch[1].trim()
		}
		
		const idMatch = envContent.match(/^MCP_ID=(.+)$/m)
		if (idMatch) {
			mcpId = idMatch[1].trim()
		}
	}
	
	return {
		mcpServerUrl: mcpServerUrl || 'https://your-server.example.com/mcp',
		mcpAuthSecret,
		mcpId
	}
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

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
	const promptContent = readFileSync(PROMPT_PATH, 'utf8')
	
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

function saveAgent(config: AgentConfig, content: string): string {
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true })
	}
	
	const filename = `${slugify(config.companyName)}-agent.json`
	const filepath = join(OUTPUT_DIR, filename)
	
	writeFileSync(filepath, content, 'utf8')
	return filepath
}

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

async function interactiveMode(): Promise<AgentConfig> {
	console.log('\n🤖 Retell Agent Generator\n')
	console.log('Generate a new agent configuration for a company.\n')
	
	const companyName = await prompt('Company name: ')
	const companyId = await prompt('Autotask Company ID: ')
	const queueId = await prompt('Autotask Queue ID: ')
	
	const agentName = `${companyName} HelpDesk Agent`
	
	return {
		agentName,
		companyName,
		companyId,
		queueId
	}
}

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
