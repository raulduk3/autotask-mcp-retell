# Autotask MCP for Retell

A stateful Model Context Protocol (MCP) server for creating Autotask tickets via Retell AI voice agents.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Autotask credentials

# Start the server
npm run dev
```

## Documentation

**[Full API Documentation](./docs/modules.md)** — Detailed API reference for all modules

## Features

- Stateful MCP architecture with session management
- SSE streaming with resumability support
- Two-factor auth: Bearer token + IP whitelist
- Human-in-the-loop IP whitelisting
- JSON-RPC compliant error codes

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mcp` | Main MCP endpoint for initialization and tool calls |
| GET | `/mcp` | SSE endpoint for streaming (requires `mcp-session-id`) |
| DELETE | `/mcp` | Session termination |

## Environment Variables

```bash
# Required - Autotask API
AUTOTASK_HOSTNAME=webservices15.autotask.net
AUTOTASK_API_INTEGRATION_CODE=your_code
AUTOTASK_USERNAME=your_username
AUTOTASK_SECRET=your_secret
AUTOTASK_COMPANY_ID=0
AUTOTASK_QUEUE_ID=29683498

# Required - MCP Server
MCP_SERVER_URL=https://your-server.example.com/mcp
MCP_AUTH_SECRET=your_secret_key

# Optional
PORT=3000
LOG_LEVEL=info
```

## Creating Agents

Generate Retell AI agent configurations for new tenants:

```bash
# Interactive mode
npm run generate:agent

# Or with arguments
npm run generate:agent -- --company "Acme Corp" --companyId 12345 --queueId 67890
```

This creates:
- `agents/<company-slug>-agent.json` — Import into Retell dashboard
- Updates `.tenants.json` — Registers tenant for MCP validation

### Required Files

- `agent-template.json` — Base agent configuration template
- `retell-agent-prompt.md` — System prompt with placeholders
- `.env` — MCP server URL and auth secret

### Placeholders

The generator replaces these in the template:
- `__COMPANY_NAME__` — Company name
- `__COMPANY_ID__` — Autotask company ID  
- `__QUEUE_ID__` — Autotask queue ID
- `__MCP_SERVER_URL__` — From `.env`
- `__MCP_AUTH_SECRET__` — From `.env`

## Security

### IP Whitelist

Add allowed IPs to `.whitelist` (one per line):

```
# Development
127.0.0.1
::1

# Production IPs
203.0.113.45
```

Unknown IPs are blocked and logged for manual review.

## Project Structure

```
<<<<<<< Updated upstream
├── src/                         # Source code
│   ├── index.ts                # Application entry point
│   ├── server.ts               # Express server with MCP endpoint
│   ├── config.ts               # Configuration management
│   ├── whitelist.ts            # IP whitelist management
│   ├── api/
│   │   └── autotask.ts         # Autotask API client
│   ├── mcp/
│   │   ├── server.ts           # MCP server initialization
│   │   └── tools/
│   │       └── createTicket.ts # Tool definitions and handlers
│   └── utils/
│       ├── logger.ts           # Logging utilities
│       └── inMemoryEventStore.ts
├── config/                      # Documentation tool configs
│   ├── typedoc.json            # TypeDoc markdown config
│   └── typedoc-html.json       # TypeDoc HTML config
├── scripts/                     # Build/generation scripts
│   └── generate-agent.ts
├── docs/                        # Generated markdown docs
├── docs-html/                   # Generated HTML docs
├── .env.example                 # Environment template
├── .whitelist.example           # IP whitelist template
├── eslint.config.js            # ESLint configuration
├── .prettierrc.json            # Prettier configuration
└── tsconfig.json               # TypeScript configuration
=======
src/                    # Source code
├── index.ts           # Entry point
├── server.ts          # Express server
├── config.ts          # Configuration
├── whitelist.ts       # IP whitelist
├── api/autotask.ts    # Autotask API client
├── mcp/server.ts      # MCP server
└── mcp/tools/         # Tool handlers

scripts/               # CLI tools
└── generate-agent.ts  # Agent generator

config/                # Tool configs
├── typedoc.json
└── typedoc-html.json
>>>>>>> Stashed changes
```

## Scripts

```bash
npm run dev           # Start dev server
npm run build         # Compile TypeScript
npm run start         # Run production build
npm run lint          # Run ESLint
npm run format        # Format with Prettier
npm run docs          # Generate markdown docs
npm run docs:html     # Generate HTML docs
npm run generate:agent # Create new agent config
```

## License

See [LICENSE](./LICENSE) file.
