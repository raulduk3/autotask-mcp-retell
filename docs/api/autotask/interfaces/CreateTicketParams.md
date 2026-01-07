[**Autotask MCP Server v0.1.0**](../../../README.md)

***

[Autotask MCP Server](../../../modules.md) / [api/autotask](../README.md) / CreateTicketParams

# Interface: CreateTicketParams

Defined in: [src/api/autotask.ts:27](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L27)

Parameters for creating a new Autotask ticket.

 CreateTicketParams

## Properties

### companyId

> **companyId**: `number`

Defined in: [src/api/autotask.ts:28](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L28)

Autotask company ID the ticket belongs to

***

### contactEmail?

> `optional` **contactEmail**: `string`

Defined in: [src/api/autotask.ts:32](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L32)

Contact's email address

***

### contactName

> **contactName**: `string`

Defined in: [src/api/autotask.ts:30](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L30)

Name of the person reporting the issue

***

### contactPhone?

> `optional` **contactPhone**: `string`

Defined in: [src/api/autotask.ts:31](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L31)

Contact's phone number

***

### externalID

> **externalID**: `string`

Defined in: [src/api/autotask.ts:38](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L38)

External reference ID (e.g., Retell call ID)

***

### issueDescription

> **issueDescription**: `string`

Defined in: [src/api/autotask.ts:33](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L33)

Detailed description of the issue or request

***

### preferredContactMethod

> **preferredContactMethod**: `"email"` \| `"phone"`

Defined in: [src/api/autotask.ts:34](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L34)

How the contact prefers to be reached

***

### priority

> **priority**: `"1"` \| `"2"` \| `"4"` \| `"5"`

Defined in: [src/api/autotask.ts:37](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L37)

Priority: 4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low

***

### queueId

> **queueId**: `number`

Defined in: [src/api/autotask.ts:29](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L29)

Queue ID for ticket routing to the appropriate team

***

### ticketType

> **ticketType**: `"1"` \| `"2"`

Defined in: [src/api/autotask.ts:36](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L36)

'1' for Service Request, '2' for Incident

***

### title

> **title**: `string`

Defined in: [src/api/autotask.ts:35](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L35)

Brief title/summary for the ticket
