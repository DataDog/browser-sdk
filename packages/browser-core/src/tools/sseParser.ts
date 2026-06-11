// Callbacks the SSE frame parser invokes as it consumes decoded text. The parser implements the
// WHATWG event-stream line/frame model only; consumers decide how to aggregate.
export interface SseFrameHandlers {
  // A dispatched event frame (blank line after >= 1 `data:` line); `type` is `event:` or `message`.
  onEvent: (type: string) => void
  onComment: () => void
  onId: (value: string) => void
  onRetry: (value: number) => void
}

export interface SseFrameParser {
  push: (textChunk: string) => void
}

// Stateful, allocation-bounded SSE frame parser. Buffers only a trailing partial line, splits on
// LF / CRLF / bare CR, parses fields and comments, and dispatches frames on blank lines.
export function createSseFrameParser(handlers: SseFrameHandlers): SseFrameParser {
  let lineBuffer = ''
  let currentEventType: string | undefined
  let frameHasData = false

  function dispatchFrame() {
    if (frameHasData) {
      handlers.onEvent(currentEventType !== undefined ? currentEventType : 'message')
    }
    currentEventType = undefined
    frameHasData = false
  }

  function processLine(line: string) {
    if (line === '') {
      dispatchFrame()
      return
    }
    if (line.charCodeAt(0) === 58 /* ':' */) {
      handlers.onComment()
      return
    }

    const colonIndex = line.indexOf(':')
    let field: string
    let value: string
    if (colonIndex === -1) {
      field = line
      value = ''
    } else {
      field = line.slice(0, colonIndex)
      value = line.slice(colonIndex + 1)
      // A single leading space after the colon is part of the format, not the value.
      if (value.charCodeAt(0) === 32 /* ' ' */) {
        value = value.slice(1)
      }
    }

    switch (field) {
      case 'event':
        currentEventType = value
        break
      case 'data':
        frameHasData = true
        break
      case 'id':
        handlers.onId(value)
        break
      case 'retry':
        if (/^\d+$/.test(value)) {
          handlers.onRetry(parseInt(value, 10))
        }
        break
      default:
        break
    }
  }

  return {
    push(textChunk: string) {
      if (!textChunk) {
        return
      }
      lineBuffer += textChunk
      let start = 0
      let i = 0
      while (i < lineBuffer.length) {
        const code = lineBuffer.charCodeAt(i)
        if (code === 10 /* '\n' */) {
          processLine(lineBuffer.slice(start, i))
          i++
          start = i
        } else if (code === 13 /* '\r' */) {
          // A trailing CR may be the first half of a CRLF spanning the next chunk; hold it back.
          if (i === lineBuffer.length - 1) {
            break
          }
          processLine(lineBuffer.slice(start, i))
          i++
          if (lineBuffer.charCodeAt(i) === 10 /* '\n' */) {
            i++
          }
          start = i
        } else {
          i++
        }
      }
      lineBuffer = lineBuffer.slice(start)
    },
  }
}
