import type { ServerDuration } from '@datadog/js-core/time'
import {
  createSseEventCounter,
  isSseContentType,
  MAX_SSE_EVENT_NAMES,
  MAX_SSE_EVENT_NAME_LENGTH,
  SSE_OTHER_EVENT_NAME,
} from './sse'
import type { SseFinalizeInfo } from './sse'

const STREAM_CLOSED: SseFinalizeInfo = { trackingEndReason: 'stream_closed' }

function countsByName(events: Array<{ name: string; count: number }> | undefined): Record<string, number> {
  const result: Record<string, number> = {}
  events?.forEach(({ name, count }) => {
    result[name] = count
  })
  return result
}

describe('isSseContentType', () => {
  it('is true for text/event-stream', () => {
    expect(isSseContentType('text/event-stream')).toBe(true)
  })

  it('is true ignoring a charset suffix', () => {
    expect(isSseContentType('text/event-stream; charset=utf-8')).toBe(true)
  })

  it('is true ignoring leading whitespace and case', () => {
    expect(isSseContentType('  Text/Event-Stream')).toBe(true)
  })

  it('is false for other content types', () => {
    expect(isSseContentType('application/json')).toBe(false)
  })

  it('is false for empty / nullish values', () => {
    expect(isSseContentType('')).toBe(false)
    expect(isSseContentType(null)).toBe(false)
    expect(isSseContentType(undefined)).toBe(false)
  })
})

describe('createSseEventCounter', () => {
  it('counts mixed named and unnamed frames', () => {
    const counter = createSseEventCounter()
    counter.push('event: tokenDelta\ndata: {}\n\ndata: {}\n\nevent: done\ndata: [DONE]\n\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(3)
    expect(countsByName(metadata.events)).toEqual({ tokenDelta: 1, message: 1, done: 1 })
  })

  it('buckets frames with no event: field under message', () => {
    const counter = createSseEventCounter()
    counter.push('data: a\n\ndata: b\n\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(countsByName(metadata.events)).toEqual({ message: 2 })
  })

  it('counts a frame split across two push() calls exactly once', () => {
    const counter = createSseEventCounter()
    counter.push('event: tok')
    counter.push('enDelta\ndata: {}\n')
    counter.push('\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(1)
    expect(countsByName(metadata.events)).toEqual({ tokenDelta: 1 })
  })

  it('counts multiple data: lines in one frame as a single event', () => {
    const counter = createSseEventCounter()
    counter.push('event: msg\ndata: line1\ndata: line2\ndata: line3\n\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(1)
  })

  it('counts comment lines separately from events', () => {
    const counter = createSseEventCounter()
    counter.push(': keepalive\nevent: a\ndata: x\n\n: another comment\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(1)
    expect(metadata.comment_count).toBe(2)
  })

  it('does not count an incomplete trailing frame', () => {
    const counter = createSseEventCounter()
    counter.push('event: a\ndata: x\n\nevent: b\ndata: y')
    const metadata = counter.finalize({ ...STREAM_CLOSED, trackingEndReason: 'aborted' })!

    expect(metadata.event_count).toBe(1)
    expect(countsByName(metadata.events)).toEqual({ a: 1 })
  })

  it('returns undefined when no events were seen', () => {
    const counter = createSseEventCounter()
    counter.push(': only a comment\n\n')
    expect(counter.finalize(STREAM_CLOSED)).toBeUndefined()
  })

  it('parses CRLF line endings identically to LF', () => {
    const counter = createSseEventCounter()
    counter.push('event: a\r\ndata: x\r\n\r\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(1)
    expect(countsByName(metadata.events)).toEqual({ a: 1 })
  })

  it('parses bare CR line endings identically to LF', () => {
    const counter = createSseEventCounter()
    // Bare CRs split the fields and the terminating blank line; the final LF resolves the held CR.
    counter.push('event: a\rdata: x\r\r')
    counter.push('\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(1)
    expect(countsByName(metadata.events)).toEqual({ a: 1 })
  })

  it('joins a CRLF split across two push() calls without dispatching a spurious frame', () => {
    const counter = createSseEventCounter()
    counter.push('event: a\rdata: x\r') // trailing CR is held back
    counter.push('\n\r\n') // completes the CRLF, then a blank line ends the frame
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.event_count).toBe(1)
    expect(countsByName(metadata.events)).toEqual({ a: 1 })
  })

  it('folds a customer event literally named _other_ into the overflow bucket without double-counting', () => {
    const counter = createSseEventCounter()
    counter.push(`event: ${SSE_OTHER_EVENT_NAME}\ndata: x\n\n`) // a real event named _other_, seen early
    for (let i = 0; i < MAX_SSE_EVENT_NAMES + 2; i++) {
      counter.push(`event: e${i}\ndata: x\n\n`) // fills the cap, then 2 overflow into _other_
    }
    const metadata = counter.finalize(STREAM_CLOSED)!

    // _other_ never occupied a tracked slot, so it appears once with the real + overflow total (1 + 2).
    expect(countsByName(metadata.events)[SSE_OTHER_EVENT_NAME]).toBe(3)
    expect(metadata.events.filter((entry) => entry.name === SSE_OTHER_EVENT_NAME).length).toBe(1)
    expect(metadata.event_count).toBe(MAX_SSE_EVENT_NAMES + 3)
  })

  it('truncates a very long last_event_id', () => {
    const counter = createSseEventCounter()
    const longId = 'a'.repeat(MAX_SSE_EVENT_NAME_LENGTH + 50)
    counter.push(`id: ${longId}\ndata: x\n\n`)
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.last_event_id!.length).toBe(MAX_SSE_EVENT_NAME_LENGTH)
  })

  it('tracks exactly 20 distinct names individually with no _other_', () => {
    const counter = createSseEventCounter()
    for (let i = 0; i < MAX_SSE_EVENT_NAMES; i++) {
      counter.push(`event: e${i}\ndata: x\n\n`)
    }
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.events.length).toBe(MAX_SSE_EVENT_NAMES)
    expect(metadata.events.some((entry) => entry.name === SSE_OTHER_EVENT_NAME)).toBe(false)
    expect(metadata.event_count).toBe(MAX_SSE_EVENT_NAMES)
  })

  it('routes names beyond the cap into _other_ while keeping the grand total', () => {
    const counter = createSseEventCounter()
    for (let i = 0; i < MAX_SSE_EVENT_NAMES + 5; i++) {
      counter.push(`event: e${i}\ndata: x\n\n`)
    }
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.events.length).toBe(MAX_SSE_EVENT_NAMES + 1)
    expect(countsByName(metadata.events)[SSE_OTHER_EVENT_NAME]).toBe(5)
    expect(metadata.event_count).toBe(MAX_SSE_EVENT_NAMES + 5)
  })

  it('truncates very long event names', () => {
    const counter = createSseEventCounter()
    const longName = 'x'.repeat(MAX_SSE_EVENT_NAME_LENGTH + 50)
    counter.push(`event: ${longName}\ndata: y\n\n`)
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.events[0].name.length).toBe(MAX_SSE_EVENT_NAME_LENGTH)
  })

  it('captures last_event_id and retry_hint', () => {
    const counter = createSseEventCounter()
    counter.push('id: 1\nretry: 3000\ndata: x\n\nid: 2\ndata: y\n\n')
    const metadata = counter.finalize(STREAM_CLOSED)!

    expect(metadata.last_event_id).toBe('2')
    expect(metadata.retry_hint).toBe(3000)
  })

  it('merges caller-provided timing and end reason into finalize', () => {
    const counter = createSseEventCounter()
    counter.push('data: x\n\n')
    const metadata = counter.finalize({
      lastEventAt: 20 as ServerDuration,
      endTime: 30 as ServerDuration,
      trackingEndReason: 'byte_cap',
    })!

    expect(metadata.last_event_at).toBe(20 as ServerDuration)
    expect(metadata.end_time).toBe(30 as ServerDuration)
    expect(metadata.tracking_end_reason).toBe('byte_cap')
  })
})
