[**Autotask MCP Server v0.1.0**](../../../README.md)

***

<<<<<<< Updated upstream
[Autotask MCP Server](../../../modules.md) / [api/autotask](../README.md) / getTicketById
=======
[Autotask MCP Server](../../../README.md) / [api/autotask](../README.md) / getTicketById
>>>>>>> Stashed changes

# Function: getTicketById()

> **getTicketById**(`ticketId`): `Promise`\<[`TicketDetails`](../interfaces/TicketDetails.md)\>

Defined in: [src/api/autotask.ts:293](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L293)

**`Function`**

Retrieves detailed ticket information from Autotask by ticket ID.

Used to get the ticket number and assigned resource after creation.

## Parameters

### ticketId

`string`

The Autotask ticket ID to retrieve

## Returns

`Promise`\<[`TicketDetails`](../interfaces/TicketDetails.md)\>

Ticket details including number and assignment

## Async

getTicketById

## Throws

If the ticket is not found or API returns an error

## Example

```typescript
const ticket = await getTicketById('123456')
console.log(`Ticket ${ticket.ticketNumber} assigned to ${ticket.assignedResourceID}`)
```
