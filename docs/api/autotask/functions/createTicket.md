[**Autotask MCP Server v0.1.0**](../../../README.md)

***

[Autotask MCP Server](../../../modules.md) / [api/autotask](../README.md) / createTicket

# Function: createTicket()

> **createTicket**(`params`): `Promise`\<[`AutotaskTicketResponse`](../interfaces/AutotaskTicketResponse.md)\>

Defined in: [src/api/autotask.ts:186](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L186)

**`Function`**

Creates a new ticket in Autotask.

Constructs the ticket payload with contact information, description,
and routing details, then submits it to the Autotask REST API.

## Parameters

### params

[`CreateTicketParams`](../interfaces/CreateTicketParams.md)

Ticket creation parameters

## Returns

`Promise`\<[`AutotaskTicketResponse`](../interfaces/AutotaskTicketResponse.md)\>

The created ticket response with itemId

## Async

createTicket

## Throws

If the API returns an error status or invalid response

## Example

```typescript
const result = await createTicket({
  companyId: 12345,
  queueId: 67890,
  contactName: 'John Doe',
  contactPhone: '555-1234',
  issueDescription: 'Cannot print',
  preferredContactMethod: 'phone',
  title: 'Printer Issue',
  ticketType: '2',
  priority: '2',
  externalID: 'retell-abc123'
})
console.log(`Created ticket: ${result.itemId}`)
```
