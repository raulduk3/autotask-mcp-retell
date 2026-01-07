[**Autotask MCP Server v0.1.0**](../../../README.md)

***

<<<<<<< Updated upstream
[Autotask MCP Server](../../../modules.md) / [api/autotask](../README.md) / getResourceById
=======
[Autotask MCP Server](../../../README.md) / [api/autotask](../README.md) / getResourceById
>>>>>>> Stashed changes

# Function: getResourceById()

> **getResourceById**(`resourceId`): `Promise`\<[`ResourceDetails`](../interfaces/ResourceDetails.md)\>

Defined in: [src/api/autotask.ts:389](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/api/autotask.ts#L389)

**`Function`**

Retrieves resource (technician) details from Autotask by resource ID.

Used to get contact information for call transfers when a ticket
is assigned to a specific technician.

## Parameters

### resourceId

`string`

The Autotask resource ID to retrieve

## Returns

`Promise`\<[`ResourceDetails`](../interfaces/ResourceDetails.md)\>

Resource details including phone numbers

## Async

getResourceById

## Throws

If the resource is not found or API returns an error

## Example

```typescript
const resource = await getResourceById('789')
const transferPhone = resource.mobilePhone || resource.officePhone
console.log(`Transfer to ${resource.firstName} at ${transferPhone}`)
```
