import { createSseFrameParser } from './sseParser'
import type { SseFrameHandlers } from './sseParser'

function trackingHandlers() {
  const events: string[] = []
  const ids: string[] = []
  const retries: number[] = []
  let comments = 0
  const handlers: SseFrameHandlers = {
    onEvent: (type) => events.push(type),
    onComment: () => {
      comments++
    },
    onId: (value) => ids.push(value),
    onRetry: (value) => retries.push(value),
  }
  return {
    handlers,
    events,
    ids,
    retries,
    get comments() {
      return comments
    },
  }
}

describe('createSseFrameParser', () => {
  it('dispatches a named frame on the terminating blank line', () => {
    const tracker = trackingHandlers()
    const parser = createSseFrameParser(tracker.handlers)

    parser.push('event: tokenDelta\ndata: {}\n\n')

    expect(tracker.events).toEqual(['tokenDelta'])
  })

  it('defaults the event type to message when no event: field is present', () => {
    const tracker = trackingHandlers()
    const parser = createSseFrameParser(tracker.handlers)

    parser.push('data: a\n\ndata: b\n\n')

    expect(tracker.events).toEqual(['message', 'message'])
  })

  it('does not dispatch a frame that carried no data: line', () => {
    const tracker = trackingHandlers()
    const parser = createSseFrameParser(tracker.handlers)

    parser.push('event: ping\n\n')

    expect(tracker.events).toEqual([])
  })

  it('joins a frame split across push() calls and dispatches it once', () => {
    const tracker = trackingHandlers()
    const parser = createSseFrameParser(tracker.handlers)

    parser.push('event: tok')
    parser.push('enDelta\ndata: {}\n')
    parser.push('\n')

    expect(tracker.events).toEqual(['tokenDelta'])
  })

  it('reports comments and the latest id / retry without dispatching frames for them', () => {
    const tracker = trackingHandlers()
    const parser = createSseFrameParser(tracker.handlers)

    parser.push(': keepalive\nid: 1\nretry: 3000\ndata: x\n\nid: 2\ndata: y\n\n')

    expect(tracker.events).toEqual(['message', 'message'])
    expect(tracker.comments).toBe(1)
    expect(tracker.ids).toEqual(['1', '2'])
    expect(tracker.retries).toEqual([3000])
  })

  it('ignores a non-numeric retry value', () => {
    const tracker = trackingHandlers()
    const parser = createSseFrameParser(tracker.handlers)

    parser.push('retry: soon\ndata: x\n\n')

    expect(tracker.retries).toEqual([])
  })
})
