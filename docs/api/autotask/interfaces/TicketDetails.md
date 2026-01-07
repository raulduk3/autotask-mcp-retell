[**Autotask MCP Server v0.1.0**](../../../README.md)

***

<<<<<<< Updated upstream
[Autotask MCP Server](../../../modules.md) / [api/autotask](../README.md) / TicketDetails
=======
[Autotask MCP Server](../../../README.md) / [api/autotask](../README.md) / TicketDetails
>>>>>>> Stashed changes

# Interface: TicketDetails

Defined in: [src/api/autotask.ts:67](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L67)

Detailed ticket information returned from Autotask.

 TicketDetails

## Properties

### assignedResourceID?

> `optional` **assignedResourceID**: `string`

Defined in: [src/api/autotask.ts:70](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L70)

ID of the assigned technician, if any

***

### id

> **id**: `string`

Defined in: [src/api/autotask.ts:68](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L68)

Unique ticket identifier

***

### priority

> **priority**: `number`

Defined in: [src/api/autotask.ts:73](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L73)

Ticket priority code

***

### status

> **status**: `number`

Defined in: [src/api/autotask.ts:72](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L72)

Ticket status code

***

### ticketNumber

> **ticketNumber**: `string`

Defined in: [src/api/autotask.ts:69](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L69)

Human-readable ticket number (e.g., 'T20240101.0001')

***

### title

> **title**: `string`

Defined in: [src/api/autotask.ts:71](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L71)

Ticket title/summary
