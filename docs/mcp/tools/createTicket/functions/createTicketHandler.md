[**Autotask MCP Server v0.1.0**](../../../../README.md)

***

[Autotask MCP Server](../../../../modules.md) / [mcp/tools/createTicket](../README.md) / createTicketHandler

# Function: createTicketHandler()

> **createTicketHandler**(`params`): `Promise`\<\{\[`key`: `string`\]: `unknown`; `_meta?`: \{\[`key`: `string`\]: `unknown`; `io.modelcontextprotocol/related-task?`: \{ `taskId`: `string`; \}; `progressToken?`: `string` \| `number`; \}; `content`: (\{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `data`: `string`; `mimeType`: `string`; `type`: `"image"`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `data`: `string`; `mimeType`: `string`; `type`: `"audio"`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `description?`: `string`; `icons?`: `object`[]; `mimeType?`: `string`; `name`: `string`; `title?`: `string`; `type`: `"resource_link"`; `uri`: `string`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `resource`: \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `mimeType?`: `string`; `text`: `string`; `uri`: `string`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `blob`: `string`; `mimeType?`: `string`; `uri`: `string`; \}; `type`: `"resource"`; \})[]; `isError?`: `boolean`; `structuredContent?`: \{\[`key`: `string`\]: `unknown`; \}; \}\>

Defined in: [src/mcp/tools/createTicket.ts:106](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/mcp/tools/createTicket.ts#L106)

**`Function`**

Handles the createTicket tool invocation from MCP clients.

This handler:
1. Validates the tenant (companyId) against the whitelist
2. Creates a ticket in Autotask via the REST API
3. Retrieves ticket details including ticket number
4. Optionally retrieves assigned resource details for call transfer

## Parameters

### params

The validated tool parameters

#### companyId

`string`

Autotask company ID for tenant isolation

#### contactEmail?

`string`

Contact's email address

#### contactName

`string`

Name of the person reporting the issue

#### contactPhone?

`string`

Contact's phone number

#### externalID

`string`

External reference ID from Retell call

#### issueDescription

`string`

Detailed description of the issue

#### preferredContactMethod

`"email"` \| `"phone"`

How the contact prefers to be reached

#### priority

`"1"` \| `"2"` \| `"4"` \| `"5"`

Priority level: 4=P1 Critical, 1=P2 High, 2=P3 Medium, 5=P4 Low

#### queueId

`string`

Autotask queue ID for ticket routing

#### ticketType

`"1"` \| `"2"`

'1' for Service Request, '2' for Incident

#### title

`string`

Brief title/summary of the ticket

## Returns

`Promise`\<\{\[`key`: `string`\]: `unknown`; `_meta?`: \{\[`key`: `string`\]: `unknown`; `io.modelcontextprotocol/related-task?`: \{ `taskId`: `string`; \}; `progressToken?`: `string` \| `number`; \}; `content`: (\{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `text`: `string`; `type`: `"text"`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `data`: `string`; `mimeType`: `string`; `type`: `"image"`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `data`: `string`; `mimeType`: `string`; `type`: `"audio"`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `description?`: `string`; `icons?`: `object`[]; `mimeType?`: `string`; `name`: `string`; `title?`: `string`; `type`: `"resource_link"`; `uri`: `string`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `annotations?`: \{ `audience?`: (`"user"` \| `"assistant"`)[]; `lastModified?`: `string`; `priority?`: `number`; \}; `resource`: \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `mimeType?`: `string`; `text`: `string`; `uri`: `string`; \} \| \{ `_meta?`: \{\[`key`: `string`\]: `unknown`; \}; `blob`: `string`; `mimeType?`: `string`; `uri`: `string`; \}; `type`: `"resource"`; \})[]; `isError?`: `boolean`; `structuredContent?`: \{\[`key`: `string`\]: `unknown`; \}; \}\>

MCP tool result with ticket details or error

## Async

createTicketHandler

## Throws

Propagates Autotask API errors wrapped in the result object

## Example

```ts
// Success response:
{
  content: [{ type: 'text', text: '{"status":"success","ticket_id":"123","ticket_number":"T20240101.0001","assigned_tech":"Jane Smith","transfer_phone":"555-9999"}' }]
}

// Error response:
{
  content: [{ type: 'text', text: '{"status":"error","error":"Invalid company ID: 99999"}' }],
  isError: true
}
```
