[**Autotask MCP Server v0.1.0**](../../../../README.md)

***

[Autotask MCP Server](../../../../modules.md) / [mcp/tools/createTicket](../README.md) / createTicketSchema

# Variable: createTicketSchema

> `const` **createTicketSchema**: `object`

Defined in: [src/mcp/tools/createTicket.ts:42](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/mcp/tools/createTicket.ts#L42)

Schema definition for the createTicket MCP tool.

This object defines the tool's name, description, and input validation schema
using Zod for runtime type checking. The schema is registered with the MCP server
and exposed to connected AI agents.

## Type Declaration

### description

> **description**: `string` = `'Create an Autotask ticket (service request or incident)'`

### inputSchema

> **inputSchema**: `ZodObject`\<\{ `companyId`: `ZodString`; `contactEmail`: `ZodString`; `contactName`: `ZodString`; `contactPhone`: `ZodString`; `externalID`: `ZodString`; `issueDescription`: `ZodString`; `preferredContactMethod`: `ZodEnum`\<\{ `email`: `"email"`; `phone`: `"phone"`; \}\>; `priority`: `ZodEnum`\<\{ `1`: `"1"`; `2`: `"2"`; `4`: `"4"`; `5`: `"5"`; \}\>; `queueId`: `ZodString`; `ticketType`: `ZodEnum`\<\{ `1`: `"1"`; `2`: `"2"`; \}\>; `title`: `ZodString`; \}, `$strip`\>

### name

> **name**: `string` = `'createTicket'`

## Example

```ts
// Tool input example:
{
  companyId: '12345',
  queueId: '67890',
  contactName: 'John Doe',
  contactPhone: '555-1234',
  contactEmail: 'john@example.com',
  preferredContactMethod: 'phone',
  issueDescription: 'Printer not working',
  title: 'Printer Issue',
  ticketType: '2',  // Incident
  priority: '2',    // P3 Medium
  externalID: 'retell-call-abc123'
}
```

## Const
