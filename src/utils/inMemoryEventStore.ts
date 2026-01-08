/**
 * @fileoverview In-memory event store for MCP SSE streaming resumability.
 * 
 * Implements the EventStore interface from the MCP SDK to enable
 * Server-Sent Events (SSE) reconnection with event replay. This allows
 * clients to resume from their last received event after a disconnection.
 * 
 * **Note:** This implementation is intended for development and testing.
 * Production deployments should use a persistent storage solution (Redis,
 * database, etc.) to survive server restarts.
 * 
 * @module utils/inMemoryEventStore
 * @see {@link https://github.com/modelcontextprotocol/typescript-sdk|MCP TypeScript SDK}
 */
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { EventStore } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

/**
 * Maximum number of events to retain per stream.
 * Older events are automatically pruned when this limit is exceeded.
 * @internal
 */
const MAX_EVENTS_PER_STREAM = 100

/**
 * In-memory implementation of the MCP EventStore interface.
 * 
 * Provides event storage and replay capabilities for SSE streaming,
 * enabling clients to reconnect and resume from their last received event.
 * 
 * Features:
 * - Unique event ID generation per stream
 * - Event replay after a specific event ID
 * - Automatic pruning of old events (configurable limit)
 * - Per-stream event count tracking
 * - Health reporting utilities
 * 
 * Event IDs follow the pattern: `{streamId}_{timestamp}_{random}`
 * This ensures uniqueness and allows stream ID extraction.
 * 
 * @example
 * ```typescript
 * import { InMemoryEventStore } from './utils/inMemoryEventStore.js'
 * 
 * const eventStore = new InMemoryEventStore()
 * const transport = new StreamableHTTPServerTransport({
 *   eventStore,
 *   // ... other options
 * })
 * ```
 */
export class InMemoryEventStore implements EventStore {
	/**
	 * Map of event ID to event data (stream ID and message).
	 */
	private events: Map<string, { streamId: string; message: JSONRPCMessage }> = new Map()

	/**
	 * Tracks the number of events per stream for pruning.
	 */
	private streamEventCounts: Map<string, number> = new Map()

	/**
	 * Generates a unique event ID for a given stream.
	 * Format: `{streamId}_{timestamp}_{random8chars}`
	 * 
	 * @param streamId - The stream identifier
	 * @returns A unique event ID
	 */
	private generateEventId(streamId: string): string {
		return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
	}

	/**
	 * Extracts the stream ID from an event ID.
	 * Parses the event ID format `{streamId}_{timestamp}_{random}`
	 * and returns the stream ID portion.
	 * 
	 * @param eventId - The event identifier
	 * @returns The extracted stream ID, or empty string if invalid
	 */
	private getStreamIdFromEventId(eventId: string): string {
		const parts = eventId.split('_')
		return parts.length > 0 ? parts[0] : ''
	}

	/**
	 * Stores an event with a generated event ID.
	 * Implements the EventStore.storeEvent interface method.
	 * Automatically prunes oldest events when the stream exceeds MAX_EVENTS_PER_STREAM.
	 * 
	 * @param streamId - The stream to store the event in
	 * @param message - The JSON-RPC message to store
	 * @returns The generated event ID
	 */
	async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
		const eventId = this.generateEventId(streamId)
		this.events.set(eventId, { streamId, message })
		
		// Track event count per stream and enforce limit
		const count = (this.streamEventCounts.get(streamId) || 0) + 1
		this.streamEventCounts.set(streamId, count)
		
		// Prune oldest events if stream exceeds limit
		if (count > MAX_EVENTS_PER_STREAM) {
			this.pruneOldestEventsForStream(streamId, count - MAX_EVENTS_PER_STREAM)
		}
		
		return eventId
	}

	/**
	 * Replays events that occurred after a specific event ID.
	 * Implements the EventStore.replayEventsAfter interface method.
	 * Used for SSE reconnection when a client provides a Last-Event-ID header.
	 * Events are replayed in chronological order.
	 * 
	 * @param lastEventId - The last event ID the client received
	 * @param options - Replay options
	 * @param options.send - Callback to send each event
	 * @returns The stream ID, or empty string if lastEventId is invalid
	 */
	async replayEventsAfter(
		lastEventId: string,
		{ send }: { send: (eventId: string, message: JSONRPCMessage) => Promise<void> }
	): Promise<string> {
		if (!lastEventId || !this.events.has(lastEventId)) {
			return ''
		}

		// Extract the stream ID from the event ID
		const streamId = this.getStreamIdFromEventId(lastEventId)
		if (!streamId) {
			return ''
		}

		let foundLastEvent = false

		// Sort events by eventId for chronological ordering
		const sortedEvents = [...this.events.entries()].sort((a, b) => a[0].localeCompare(b[0]))

		for (const [eventId, { streamId: eventStreamId, message }] of sortedEvents) {
			// Only include events from the same stream
			if (eventStreamId !== streamId) {
				continue
			}

			// Start sending events after we find the lastEventId
			if (eventId === lastEventId) {
				foundLastEvent = true
				continue
			}

			if (foundLastEvent) {
				await send(eventId, message)
			}
		}
		return streamId
	}

	/**
	 * Clears all events for a specific stream.
	 * Should be called during session cleanup to free memory.
	 * 
	 * @param streamId - The stream ID to clear events for
	 */
	clearEventsForStream(streamId: string): void {
		const toDelete: string[] = []
		for (const [eventId, { streamId: eventStreamId }] of this.events) {
			if (eventStreamId === streamId) {
				toDelete.push(eventId)
			}
		}
		for (const eventId of toDelete) {
			this.events.delete(eventId)
		}
		this.streamEventCounts.delete(streamId)
	}

	/**
	 * Removes the oldest events from a stream to enforce the event limit.
	 * Events are sorted by ID (chronologically) and the oldest are removed.
	 * 
	 * @param streamId - The stream to prune
	 * @param count - Number of events to remove
	 */
	private pruneOldestEventsForStream(streamId: string, count: number): void {
		const streamEvents = [...this.events.entries()]
			.filter(([, { streamId: sid }]) => sid === streamId)
			.sort((a, b) => a[0].localeCompare(b[0]))
		
		for (let i = 0; i < count && i < streamEvents.length; i++) {
			this.events.delete(streamEvents[i][0])
		}
	}

	/**
	 * Returns the total number of stored events across all streams.
	 * Useful for health monitoring and memory usage reporting.
	 * 
	 * @returns Total event count
	 */
	getEventCount(): number {
		return this.events.size
	}

	/**
	 * Returns the number of active streams with stored events.
	 * Useful for health monitoring and session tracking.
	 * 
	 * @returns Active stream count
	 */
	getStreamCount(): number {
		return this.streamEventCounts.size
	}
}
