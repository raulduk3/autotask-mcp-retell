[**Autotask MCP Server v0.1.0**](../../README.md)

***

[Autotask MCP Server](../../modules.md) / [whitelist](../README.md) / getClientIP

# Function: getClientIP()

> **getClientIP**(`req`): `string`

Defined in: [src/whitelist.ts:81](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/whitelist.ts#L81)

Get the client IP address from the request
Handles proxies and forwarded headers

## Parameters

### req

`Request`

Express request object

## Returns

`string`

Client IP address
