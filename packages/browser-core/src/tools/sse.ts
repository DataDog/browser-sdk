import type { ServerDuration } from '@datadog/js-core/time'
import { ONE_SECOND } from '@datadog/js-core/time'
import { safeTruncate } from './utils/stringUtils'
import { ONE_MEBI_BYTE } from './utils/byteUtils'
import { createSseFrameParser } from './sseParser'

// Distinct event names tracked per resource; names beyond the cap accumulate into `_other_`.
export const MAX_SSE_EVENT_NAMES = 20
export const MAX_SSE_EVENT_NAME_LENGTH = 64

// Reserved overflow bucket. A customer event literally named `_other_` is folded in (see `record`).
export const SSE_OTHER_EVENT_NAME = '_other_'

// Caps bounding the incremental read for long-lived or never-closing streams.
export const SSE_BYTE_LIMIT = ONE_MEBI_BYTE
export const SSE_TIME_LIMIT = 30 * ONE_SECOND

export type SseTrackingEndReason = 'stream_closed' | 'byte_cap' | 'time_cap' | 'error' | 'aborted'

export interface SseEventEntry {
  name: string
  count: number
}

export interface SseMetadata {
  event_count: number
  events: SseEventEntry[]
  comment_count: number
  last_event_id?: string
  retry_hint?: number
  last_event_at?: ServerDuration
  end_time?: ServerDuration
  tracking_end_reason: SseTrackingEndReason
}

// Read-loop info merged in at finalize. Internal (never serialized), so camelCase; `finalize` maps
// it onto the snake_case `SseMetadata` wire shape.
export interface SseFinalizeInfo {
  lastEventAt?: ServerDuration
  endTime?: ServerDuration
  trackingEndReason: SseTrackingEndReason
}

export interface SseEventCounter {
  push: (textChunk: string) => void
  finalize: (info: SseFinalizeInfo) => SseMetadata | undefined
}

export function isSseContentType(contentType: string | null | undefined): boolean {
  return !!contentType && contentType.trim().toLowerCase().startsWith('text/event-stream')
}

// Tallies parsed SSE frames by name, capping distinct names and length so the metadata stays
// bounded. Delegates parsing to `createSseFrameParser`; the `data:` payload is never retained.
export function createSseEventCounter(): SseEventCounter {
  let eventCount = 0
  let commentCount = 0
  const counts = new Map<string, number>()
  let otherCount = 0
  let lastEventId: string | undefined
  let retryHint: number | undefined

  function record(name: string) {
    // Keep the reserved name out of `counts` so a real `_other_` event can't collide with overflow.
    if (name === SSE_OTHER_EVENT_NAME) {
      otherCount++
      return
    }
    const existing = counts.get(name)
    if (existing !== undefined) {
      counts.set(name, existing + 1)
    } else if (counts.size < MAX_SSE_EVENT_NAMES) {
      counts.set(name, 1)
    } else {
      otherCount++
    }
  }

  const parser = createSseFrameParser({
    onEvent: (type) => {
      eventCount++
      record(safeTruncate(type, MAX_SSE_EVENT_NAME_LENGTH))
    },
    onComment: () => {
      commentCount++
    },
    onId: (value) => {
      lastEventId = safeTruncate(value, MAX_SSE_EVENT_NAME_LENGTH)
    },
    onRetry: (value) => {
      retryHint = value
    },
  })

  return {
    push: parser.push,

    finalize(info: SseFinalizeInfo): SseMetadata | undefined {
      // An incomplete trailing frame (no terminating blank line) is intentionally not counted.
      if (eventCount === 0) {
        return undefined
      }

      const events: SseEventEntry[] = []
      counts.forEach((count, name) => {
        events.push({ name, count })
      })
      if (otherCount > 0) {
        events.push({ name: SSE_OTHER_EVENT_NAME, count: otherCount })
      }

      return {
        event_count: eventCount,
        events,
        comment_count: commentCount,
        last_event_id: lastEventId,
        retry_hint: retryHint,
        last_event_at: info.lastEventAt,
        end_time: info.endTime,
        tracking_end_reason: info.trackingEndReason,
      }
    },
  }
}
