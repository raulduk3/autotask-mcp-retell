# Autotask MCP for Retell

A memory-conscious, stateful Model Context Protocol (MCP) server for creating Autotask tickets via Retell AI voice agents.

## Features

- **Stateful Architecture**: Maintains session state with proper memory management
- **Memory Efficient**: Singleton server instance reused across all sessions
- **Session Management**: UUID-based sessions with automatic cleanup
- **Server-Sent Events (SSE)**: Supports streaming responses via GET endpoint
- **Resumability**: SSE reconnection support with Last-Event-ID header
- **Streamable HTTP Transport**: Uses MCP SDK's StreamableHTTPServerTransport
- **Modular Design**: Separate files for server, tools, and API calls
- **Two-Factor Authentication**: Bearer token authentication + IP whitelist
- **HITL Security**: Human-in-the-loop IP whitelisting with warnings for unknown IPs
- **Proper Error Codes**: JSON-RPC compliant error codes (-32000, -32603, -32600, etc.)
- **Easy to Extend**: Simple process for adding new tools

## Architecture

This implementation follows the MCP TypeScript SDK's streamable HTTP pattern:

### Endpoints

- **POST /mcp** - Main MCP endpoint for initialization and tool calls
  - Initialize: Send JSON-RPC initialize request (generates session ID)
  - Tool Calls: Include `mcp-session-id` header with existing session ID
  
- **GET /mcp** - Server-Sent Events (SSE) endpoint for streaming
  - Requires `mcp-session-id` header
  - Supports resumability via `Last-Event-ID` header
  
- **DELETE /mcp** - Session termination
  - Requires `mcp-session-id` header
  - Properly cleans up session resources

### Memory Management

- Single MCP server instance shared across all sessions (memory efficient)
- Transport instances stored per session in a map
- Automatic cleanup when transport closes
- Graceful shutdown closes all active transports

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Autotask credentials and optional auth secret
```

3. Run the server:
```bash
npm run dev
```

## Environment Variables

- `AUTOTASK_API_INTEGRATION_CODE` - Your Autotask API integration code
- `AUTOTASK_USERNAME` - Your Autotask username/email
- `AUTOTASK_SECRET` - Your Autotask API secret
- `MCP_AUTH_SECRET` - (Optional) Bearer token for client authentication

## Security

This server implements two-factor authentication:

1. **Bearer Token Authentication** (First Factor)
   - Set `MCP_AUTH_SECRET` environment variable
   - Clients must include `Authorization` header with matching token
   
2. **IP Whitelist** (Second Factor - HITL)
   - Managed via `.whitelist` file in project root
   - Add one IP address per line
   - Lines starting with `#` are treated as comments
   - Unknown IPs are blocked and logged with warnings
   - Localhost IPs (`127.0.0.1`, `::1`) are pre-configured for development

### Adding IPs to Whitelist

When Retell (or any client) first attempts to connect, the server will log:

```
⚠️  WARNING: Unknown IP attempting connection!
⚠️  IP Address: 203.0.113.45
⚠️  Method: POST /mcp
⚠️  User-Agent: ...
⚠️  Add this IP to .whitelist file if legitimate
```

To whitelist the IP:

1. Open `.whitelist` file
2. Add the IP address on a new line
3. Restart the server
4. The IP will now be allowed through

Example `.whitelist`:
```
# Development
127.0.0.1
::1

# Retell AI servers
203.0.113.45
198.51.100.10
```

## Project Structure

```
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
```

## Adding New Tools

To add a new tool to the MCP server:

### 1. Create the API function (if needed)

Add your API call to the appropriate file in `src/api/`:

```typescript
// src/api/autotask.ts or create a new file
export async function myNewApiCall(params: MyParams): Promise<MyResponse> {
  // Your API logic here
}
```

### 2. Create a new tool file

Create a new file in `src/mcp/tools/`:

```typescript
// src/mcp/tools/myNewTool.ts
import { z } from 'zod'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { myNewApiCall } from '../api/yourApi.js'

export const myNewToolSchema = {
  name: 'myNewTool',
  description: 'Description of what this tool does',
  inputSchema: z.object({
    param1: z.string().describe('Description of param1'),
    param2: z.number().optional().describe('Description of param2')
  })
}

export async function myNewToolHandler(params: {
  param1: string
  param2?: number
}): Promise<CallToolResult> {
  try {
    const result = await myNewApiCall(params)
    
    return {
      content: [{
        type: 'text',
        text: `Success: ${result}`
      }]
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    }
  }
}
```

### 3. Register the tool

Update `src/mcp/server.ts` to register your new tool:

```typescript
import { myNewToolSchema, myNewToolHandler } from './tools/myNewTool.js'

export function createMcpServer(): McpServer {
  // ... existing code ...
  
  // Register your new tool
  server.registerTool(
    myNewToolSchema.name,
    {
      description: myNewToolSchema.description,
      inputSchema: myNewToolSchema.inputSchema
    },
    myNewToolHandler
  )
  
  console.log('✓ Server created with tools:', ['createTicket', 'myNewTool'])
  
  return server
}
```

That's it! Your new tool is now available via the MCP server.

## API Endpoints

### POST /mcp

The main MCP endpoint. Accepts JSON-RPC 2.0 requests.

**Headers:**
- `Content-Type: application/json`
- `Authorization: <MCP_AUTH_SECRET>` (if auth is enabled)

**Security:**
- Requests must come from a whitelisted IP address (if whitelist is configured)
- Must include valid Authorization header (if MCP_AUTH_SECRET is set)

**Available Tools:**
- `createTicket` - Create an Autotask ticket (service request or incident)

## License

See LICENSE file.
