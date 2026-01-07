[**Autotask MCP Server v0.1.0**](../../README.md)

***

[Autotask MCP Server](../../modules.md) / [config](../README.md) / Tenant

# Interface: Tenant

Defined in: [src/config.ts:30](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/config.ts#L30)

Represents a tenant (customer company) in the multi-tenant system.
Each tenant has a unique Autotask company ID and associated queue for ticket routing.

 Tenant

## Properties

### companyId

> **companyId**: `number`

Defined in: [src/config.ts:31](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/config.ts#L31)

Unique Autotask company identifier

***

### name

> **name**: `string`

Defined in: [src/config.ts:33](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/config.ts#L33)

Human-readable tenant/company name

***

### queueId

> **queueId**: `number`

Defined in: [src/config.ts:32](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/config.ts#L32)

Autotask queue ID for routing tickets to the correct team
