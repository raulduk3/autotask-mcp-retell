[**Autotask MCP Server v0.1.0**](../../../README.md)

***

[Autotask MCP Server](../../../modules.md) / [utils/logger](../README.md) / logger

# Variable: logger

> `const` **logger**: `Logger`\<`never`, `boolean`\>

Defined in: [src/utils/logger.ts:26](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/logger.ts#L26)

Configured Pino logger instance for the application.

Features:
- Configurable log level via `LOG_LEVEL` env var (defaults to 'info')
- Pretty-printed output in development via pino-pretty
- Automatic redaction of sensitive auth headers and Autotask credentials

## Example

```typescript
import { logger } from './utils/logger.js'

logger.info({ ticketId: 123 }, 'Ticket created')
logger.error({ error }, 'Failed to connect')
```

## Const
