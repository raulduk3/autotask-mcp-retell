[**Autotask MCP Server v0.1.0**](../../README.md)

***

<<<<<<< Updated upstream
[Autotask MCP Server](../../modules.md) / [config](../README.md) / config
=======
[Autotask MCP Server](../../README.md) / [config](../README.md) / config
>>>>>>> Stashed changes

# Variable: config

> `const` **config**: `Config`

Defined in: [src/config.ts:125](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/config.ts#L125)

Global application configuration object.
Populated from environment variables at module load time.

## Const

## Example

```typescript
import { config } from './config.js'

console.log(`Server running on port ${config.port}`)
console.log(`Autotask host: ${config.autotask.hostname}`)
```
