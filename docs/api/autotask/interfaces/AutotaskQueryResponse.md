[**Autotask MCP Server v0.1.0**](../../../README.md)

***

<<<<<<< Updated upstream
[Autotask MCP Server](../../../modules.md) / [api/autotask](../README.md) / AutotaskQueryResponse
=======
[Autotask MCP Server](../../../README.md) / [api/autotask](../README.md) / AutotaskQueryResponse
>>>>>>> Stashed changes

# Interface: AutotaskQueryResponse\<T\>

Defined in: [src/api/autotask.ts:86](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L86)

Generic response wrapper for Autotask query endpoints.

 AutotaskQueryResponse

## Type Parameters

### T

`T`

The type of items returned

## Properties

### items

> **items**: `T`[]

Defined in: [src/api/autotask.ts:87](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L87)

Array of returned items

***

### pageDetails?

> `optional` **pageDetails**: `object`

Defined in: [src/api/autotask.ts:88](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L88)

Pagination information

#### count

> **count**: `number`

#### requestCount

> **requestCount**: `number`
