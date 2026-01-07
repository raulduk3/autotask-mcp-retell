import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { EventStore } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const MAX_EVENTS_PER_STREAM = 100

/**
 * Simple in-memory implementation of the EventStore interface for resumability
 * This is primarily intended for examples and testing, not for production use
 * where a persistent storage solution would be more appropriate.
 * 
 * Based on MCP TypeScript SDK reference implementation:
 * https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/shared/inMemoryEventStore.ts
 */
export class InMemoryEventStore implements EventStore {
	private events: Map<string, { streamId: string; message: JSONRPCMessage }> = new Map()
	private streamEventCounts: Map<string, number> = new Map()

	/**
	 * Generates a unique event ID for a given stream ID
	 */
	private generateEventId(streamId: string): string {
		return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
	}

	/**
	 * Extracts the stream ID from an event ID
	 */
	private getStreamIdFromEventId(eventId: string): string {
		const parts = eventId.split('_')
		return parts.length > 0 ? parts[0] : ''
	}

	/**
	 * Stores an event with a generated event ID
	 * Implements EventStore.storeEvent
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
	 * Replays events that occurred after a specific event ID
	 * Implements EventStore.replayEventsAfter
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
	 * Clear all events for a specific stream (session cleanup)
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
	 * Prune oldest events for a stream
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
	 * Get total event count (for health reporting)
	 */
	getEventCount(): number {
		return this.events.size
	}

	/**
	 * Get stream count (for health reporting)
	 */
	getStreamCount(): number {
		return this.streamEventCounts.size
	}
}
