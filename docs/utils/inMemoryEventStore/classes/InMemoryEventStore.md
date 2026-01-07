[**Autotask MCP Server v0.1.0**](../../../README.md)

***

[Autotask MCP Server](../../../modules.md) / [utils/inMemoryEventStore](../README.md) / InMemoryEventStore

# Class: InMemoryEventStore

Defined in: [src/utils/inMemoryEventStore.ts:14](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L14)

Simple in-memory implementation of the EventStore interface for resumability
This is primarily intended for examples and testing, not for production use
where a persistent storage solution would be more appropriate.

Based on MCP TypeScript SDK reference implementation:
https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/shared/inMemoryEventStore.ts

## Implements

- `EventStore`

## Constructors

### Constructor

> **new InMemoryEventStore**(): `InMemoryEventStore`

#### Returns

`InMemoryEventStore`

## Properties

### events

> `private` **events**: `Map`\<`string`, \{ `message`: `JSONRPCMessage`; `streamId`: `string`; \}\>

Defined in: [src/utils/inMemoryEventStore.ts:15](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L15)

***

### streamEventCounts

> `private` **streamEventCounts**: `Map`\<`string`, `number`\>

Defined in: [src/utils/inMemoryEventStore.ts:16](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L16)

## Methods

### clearEventsForStream()

> **clearEventsForStream**(`streamId`): `void`

Defined in: [src/utils/inMemoryEventStore.ts:98](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L98)

Clear all events for a specific stream (session cleanup)

#### Parameters

##### streamId

`string`

#### Returns

`void`

***

### generateEventId()

> `private` **generateEventId**(`streamId`): `string`

Defined in: [src/utils/inMemoryEventStore.ts:21](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L21)

Generates a unique event ID for a given stream ID

#### Parameters

##### streamId

`string`

#### Returns

`string`

***

### getEventCount()

> **getEventCount**(): `number`

Defined in: [src/utils/inMemoryEventStore.ts:127](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L127)

Get total event count (for health reporting)

#### Returns

`number`

***

### getStreamCount()

> **getStreamCount**(): `number`

Defined in: [src/utils/inMemoryEventStore.ts:134](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L134)

Get stream count (for health reporting)

#### Returns

`number`

***

### getStreamIdFromEventId()

> `private` **getStreamIdFromEventId**(`eventId`): `string`

Defined in: [src/utils/inMemoryEventStore.ts:28](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L28)

Extracts the stream ID from an event ID

#### Parameters

##### eventId

`string`

#### Returns

`string`

***

### pruneOldestEventsForStream()

> `private` **pruneOldestEventsForStream**(`streamId`, `count`): `void`

Defined in: [src/utils/inMemoryEventStore.ts:114](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L114)

Prune oldest events for a stream

#### Parameters

##### streamId

`string`

##### count

`number`

#### Returns

`void`

***

### replayEventsAfter()

> **replayEventsAfter**(`lastEventId`, `__namedParameters`): `Promise`\<`string`\>

Defined in: [src/utils/inMemoryEventStore.ts:57](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L57)

Replays events that occurred after a specific event ID
Implements EventStore.replayEventsAfter

#### Parameters

##### lastEventId

`string`

##### \_\_namedParameters

###### send

(`eventId`, `message`) => `Promise`\<`void`\>

#### Returns

`Promise`\<`string`\>

#### Implementation of

`EventStore.replayEventsAfter`

***

### storeEvent()

> **storeEvent**(`streamId`, `message`): `Promise`\<`string`\>

Defined in: [src/utils/inMemoryEventStore.ts:37](https://github.com/raulduk3/autotask-mcp-retell/blob/f42f76ae19577aeb3390585eab5448f1cbb5c10b/src/utils/inMemoryEventStore.ts#L37)

Stores an event with a generated event ID
Implements EventStore.storeEvent

#### Parameters

##### streamId

`string`

##### message

`JSONRPCMessage`

#### Returns

`Promise`\<`string`\>

#### Implementation of

`EventStore.storeEvent`
