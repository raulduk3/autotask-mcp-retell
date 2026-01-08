#!/usr/bin/env bun
/**
 * Script to generate a condensed PDF documentation from TypeDoc markdown output.
 * Creates a clean, technical reference document grouped by module.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs'
import { join, relative } from 'path'

const DOCS_DIR = join(import.meta.dir, '..', 'docs')
const OUTPUT_DIR = join(import.meta.dir, '..', 'docs-pdf')
const COMBINED_MD = join(OUTPUT_DIR, 'autotask-mcp-server-documentation.md')

interface DocSection {
	title: string
	content: string
	order: number
}

/**
 * Recursively get all markdown files from a directory
 */
function getMarkdownFiles(dir: string, files: string[] = []): string[] {
	const entries = readdirSync(dir)
	
	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const stat = statSync(fullPath)
		
		if (stat.isDirectory()) {
			getMarkdownFiles(fullPath, files)
		} else if (entry.endsWith('.md')) {
			files.push(fullPath)
		}
	}
	
	return files
}

/**
 * Get module category from path
 */
function getCategory(filePath: string): string {
	const rel = relative(DOCS_DIR, filePath)
	if (rel === 'README.md' || rel === 'modules.md') return 'skip'
	if (rel.includes('index/')) return 'skip'
	if (rel.endsWith('/README.md')) return 'skip'
	if (rel.includes('server/')) return 'server'
	if (rel.includes('config/')) return 'config'
	if (rel.includes('whitelist/')) return 'whitelist'
	if (rel.includes('api/')) return 'api'
	if (rel.includes('mcp/server/')) return 'mcp-server'
	if (rel.includes('mcp/tools/createTicket/')) return 'mcp-tools'
	if (rel.includes('mcp/tools/getTicket/')) return 'mcp-tools'
	if (rel.includes('mcp/tools/lookupCompanyContact/')) return 'mcp-tools'
	if (rel.includes('utils/logger/')) return 'utils'
	if (rel.includes('utils/inMemoryEventStore/')) return 'utils'
	return 'skip'
}

/**
 * Get sort order for category
 */
function getCategoryOrder(category: string): number {
	const order: Record<string, number> = {
		'server': 10,
		'config': 20,
		'whitelist': 30,
		'api': 40,
		'mcp-server': 50,
		'mcp-tools': 60,
		'utils': 70
	}
	return order[category] ?? 100
}

/**
 * Clean markdown content - remove navigation, convert formats
 */
function cleanContent(content: string): string {
	let c = content
	
	// Simplify complex MCP CallToolResult return types
	c = c.replace(/`Promise`\\<\\{.*?`_meta\?`.*?`content`:.*?\\}\\>/gs, '`Promise<CallToolResult>`')
	
	// Remove navigation breadcrumbs and links
	c = c.replace(/^\[.*?\]\([^)]*\).*$/gm, '')
	c = c.replace(/\[.*?\]\(\.\.\/.*?\)/g, '')
	c = c.replace(/\[\]\([^)]*\)/g, '')
	
	// Remove horizontal rules
	c = c.replace(/^\*{3,}\s*$/gm, '')
	c = c.replace(/^---\s*$/gm, '')
	
	// Remove "Defined in:" source links
	c = c.replace(/^Defined in:.*$/gm, '')
	
	// Remove top-level TypeDoc headers, but keep the name
	c = c.replace(/^# (Function|Variable):\s*(\w+)\s*$/gm, '### $2()')
	c = c.replace(/^# (Interface|Class):\s*(\w+)\s*$/gm, '### $2')
	
	// Remove module path headers
	c = c.replace(/^#\s+[\w\/]+\s*$/gm, '')
	c = c.replace(/^\/\s*[\w\/]+\s*$/gm, '')
	
	// Remove image badges  
	c = c.replace(/!\[.*?\]\(.*?\)/g, '')
	
	// Remove ## See sections (external links)
	c = c.replace(/^## See\n+\[.*?\]\(.*?\)\s*$/gm, '')
	
	// Remove Implementation of references
	c = c.replace(/^#### Implementation of\s*\n+`[^`]+`\s*$/gm, '')
	
	// Remove @function decorators
	c = c.replace(/\*\*`@?Function`\*\*\s*/g, '')
	
	// Fix escaped angle brackets in types
	c = c.replace(/\\</g, '<')
	c = c.replace(/\\>/g, '>')
	c = c.replace(/\\{/g, '{')
	c = c.replace(/\\}/g, '}')
	c = c.replace(/\\|/g, '|')
	
	// Convert blockquote function signatures to code blocks
	// > **functionName**(params): returnType
	c = c.replace(/^>\s*\*\*(\w+)\*\*\(([^)]*)\):\s*(.+)$/gm, (_, name, params, ret) => {
		const cleanParams = params.replace(/`/g, '')
		const cleanRet = ret.replace(/`/g, '')
		return `### ${name}()\n\n\`\`\`typescript\n${name}(${cleanParams}): ${cleanRet}\n\`\`\``
	})
	
	// > `private` **functionName**(params): returnType
	c = c.replace(/^>\s*`private`\s*\*\*(\w+)\*\*\(([^)]*)\):\s*(.+)$/gm, (_, name, params, ret) => {
		const cleanParams = params.replace(/`/g, '')
		const cleanRet = ret.replace(/`/g, '')
		return `### ${name}() *(private)*\n\n\`\`\`typescript\n${name}(${cleanParams}): ${cleanRet}\n\`\`\``
	})
	
	// Convert property blockquotes to bullet list format
	// > `optional` **propName**: `type`
	c = c.replace(/^>\s*`optional`\s*\*\*(\w+)\*\*:\s*`([^`]+)`\s*$/gm, '- **$1?** (`$2`)')
	
	// > **propName**: `type`
	c = c.replace(/^>\s*\*\*(\w+)\*\*:\s*`([^`]+)`\s*$/gm, '- **$1** (`$2`)')
	c = c.replace(/^>\s*\*\*(\w+)\*\*:\s*`object`\s*$/gm, '- **$1** (`object`)')
	
	// Convert ### property headers followed by type to list items
	// ### propName\n\n`type`\n\nDescription
	c = c.replace(/^### (\w+\??)\n\n`([^`]+)`(\[\])?\n\n([^\n#]+)/gm, '- **$1** (`$2$3`) — $4')
	
	// ### propName\n\n`type` (no description)
	c = c.replace(/^### (\w+\??)\n\n`([^`]+)`(\[\])?\s*$/gm, '- **$1** (`$2$3`)')
	
	// ### param with just description (object params)
	c = c.replace(/^### (\w+)\n\n([A-Z][^`\n#]+)\s*$/gm, '- **$1** — $2')
	
	// Nested #### property: #### propName?\n\n`type`\n\nDescription
	c = c.replace(/^#### (\w+\??)\n\n`([^`]+)`\n\n([^\n#]+)/gm, '  - **$1** (`$2`) — $3')
	c = c.replace(/^#### (\w+\??)\n\n`([^`]+)`\s*$/gm, '  - **$1** (`$2`)')
	
	// Remove leftover ### and #### headers that are just property names
	c = c.replace(/^###\s+\w+\??\s*$/gm, '')
	c = c.replace(/^####\s+\w+\??\s*$/gm, '')
	
	// Remove orphan inline code types on their own lines
	c = c.replace(/^`[^`]+`(\[\])?\s*$/gm, '')
	
	// Remove empty bullets
	c = c.replace(/^-\s*$/gm, '')
	
	// Clean excessive newlines
	c = c.replace(/\n{3,}/g, '\n\n')
	
	return c.trim()
}

/**
 * Post-process the combined document
 */
function postProcess(content: string): string {
	let r = content
	
	// Join property bullets with their following description lines
	// - **propName** (`type`)\nDescription -> - **propName** (`type`) — Description
	r = r.replace(/^(- \*\*\w+\??\*\* \(`[^`]+`\))\n([A-Z][^\n#*-]+)$/gm, '$1 — $2')
	
	// Also for indented nested properties
	r = r.replace(/^(  - \*\*\w+\??\*\* \(`[^`]+`\))\n([A-Z][^\n#*-]+)$/gm, '$1 — $2')
	
	// Fix Promise types
	r = r.replace(/`Promise`<>/g, '`Promise<void>`')
	r = r.replace(/`Promise`<T>/g, '`Promise<T>`')
	r = r.replace(/`Promise`<T\[\]>/g, '`Promise<T[]>`')
	r = r.replace(/`Promise`<`([^`]+)`>/g, '`Promise<$1>`')
	r = r.replace(/`Promise`<`([^`]+)` \| `([^`]+)`>/g, '`Promise<$1 | $2>`')
	
	// Convert ## Returns to inline format
	// ## Returns\n\n`Type`\n\nDescription
	r = r.replace(/^## Returns\n\n(`[^`]+`)\n\n([^\n#]+)/gm, '**Returns:** $1 — $2')
	// ## Returns\n\n`Type`
	r = r.replace(/^## Returns\n\n(`[^`]+`)\s*$/gm, '**Returns:** $1')
	// ## Returns\n\nDescription (no type)
	r = r.replace(/^## Returns\n\n([^`\n#][^\n#]+)/gm, '**Returns:** $1')
	
	// Convert ## Throws to inline
	r = r.replace(/^## Throws\n\n(.+)$/gm, '**Throws:** $1')
	
	// Convert ## Parameters header to bold
	r = r.replace(/^## Parameters\s*$/gm, '**Parameters:**')
	
	// Convert ## Example to #### Example
	r = r.replace(/^## Example\s*$/gm, '#### Example')
	
	// Convert other ## subheaders to ####
	r = r.replace(/^## Response Fields\s*$/gm, '#### Response Fields')
	r = r.replace(/^## Status Outcomes\s*$/gm, '#### Status Outcomes')
	r = r.replace(/^## Type Declaration\s*$/gm, '#### Type Declaration')
	r = r.replace(/^## Async\s*$/gm, '')
	
	// Remove ## Implements sections
	r = r.replace(/^## Implements\n+(-\s*`.*`\n*)*/gm, '')
	
	// Remove empty generics and standalone function name references
	r = r.replace(/^\[\]\s*$/gm, '')
	r = r.replace(/^<>\s*$/gm, '')
	r = r.replace(/^\s+\w+\s*$/gm, '')
	
	// Clean excessive newlines
	r = r.replace(/\n{3,}/g, '\n\n')
	
	return r.trim()
}

/**
 * Build sections grouped by category
 */
function buildSections(files: string[]): Map<string, DocSection> {
	const sections = new Map<string, DocSection>()
	
	for (const file of files) {
		const category = getCategory(file)
		if (category === 'skip') continue
		
		const content = readFileSync(file, 'utf-8')
		const cleaned = cleanContent(content)
		
		if (!cleaned || cleaned.length < 30) continue
		
		const existing = sections.get(category)
		if (existing) {
			existing.content += '\n\n' + cleaned
		} else {
			sections.set(category, {
				title: getCategoryTitle(category),
				content: cleaned,
				order: getCategoryOrder(category)
			})
		}
	}
	
	return sections
}

/**
 * Get readable category title
 */
function getCategoryTitle(category: string): string {
	const titles: Record<string, string> = {
		'server': 'HTTP Server (server.ts)',
		'config': 'Configuration (config.ts)',
		'whitelist': 'IP Whitelist (whitelist.ts)',
		'api': 'Autotask API (api/autotask.ts)',
		'mcp-server': 'MCP Server (mcp/server.ts)',
		'mcp-tools': 'MCP Tools',
		'utils': 'Utilities'
	}
	return titles[category] ?? category
}

async function main() {
	console.log('📚 Generating condensed documentation...')
	
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true })
	}
	
	const files = getMarkdownFiles(DOCS_DIR)
	console.log(`Found ${files.length} source files`)
	
	const sections = buildSections(files)
	const sorted = Array.from(sections.values()).sort((a, b) => a.order - b.order)
	
	const parts: string[] = []
	
	// YAML frontmatter for pandoc
	parts.push(`---
title: "Autotask MCP Server"
subtitle: "Technical Reference v0.1.0"
date: "${new Date().toISOString().split('T')[0]}"
---

`)
	
	// Sections
	for (const section of sorted) {
		parts.push(`# ${section.title}\n\n`)
		parts.push(section.content)
		parts.push('\n\n')
	}
	
	const combined = postProcess(parts.join(''))
	writeFileSync(COMBINED_MD, combined)
	console.log(`✅ Markdown: ${COMBINED_MD}`)
	
	// Convert to PDF
	const pdfOutput = COMBINED_MD.replace('.md', '.pdf')
	
	try {
		const { $ } = await import('bun')
		const check = await $`which pandoc`.quiet().nothrow()
		
		if (check.exitCode === 0) {
			console.log('📄 Converting to PDF...')
			await $`pandoc ${COMBINED_MD} -o ${pdfOutput} --pdf-engine=xelatex --toc --toc-depth=1 -V geometry:margin=0.75in -V fontsize=10pt -V documentclass=article -V colorlinks=true -V linkcolor=blue -V toccolor=black`.quiet()
			console.log(`✅ PDF: ${pdfOutput}`)
		} else {
			console.log('⚠️  pandoc not found - markdown only')
		}
	} catch (e) {
		console.log('⚠️  PDF conversion failed:', e)
	}
}

main().catch(console.error)
