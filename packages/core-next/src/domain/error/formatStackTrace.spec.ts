import { formatStackTrace, formatFrame } from './formatStackTrace'
import type { StackTrace, StackFrame } from './index'

describe('formatStackTrace', () => {
  it('should format error name and message', () => {
    const trace: StackTrace = { name: 'TypeError', message: 'x is not defined', stack: [] }
    const result = formatStackTrace(trace)

    expect(result).toBe('TypeError: x is not defined')
  })

  it('should format name only when no message', () => {
    const trace: StackTrace = { name: 'Error', stack: [] }
    const result = formatStackTrace(trace)

    expect(result).toBe('Error')
  })

  it('should default to "Error" when no name', () => {
    const trace: StackTrace = { message: 'something', stack: [] }
    const result = formatStackTrace(trace)

    expect(result).toBe('Error: something')
  })

  it('should format stack frames', () => {
    const trace: StackTrace = {
      name: 'Error',
      message: 'test',
      stack: [
        { func: 'foo', url: 'http://file.js', line: 10, column: 20 },
        { func: 'bar', url: 'http://file.js', line: 25, column: 5 },
      ],
    }
    const result = formatStackTrace(trace)

    expect(result).toBe('Error: test\n  at foo @ http://file.js:10:20\n  at bar @ http://file.js:25:5')
  })

  it('should replace ? with <anonymous>', () => {
    const trace: StackTrace = {
      name: 'Error',
      message: 'test',
      stack: [{ func: '?', url: 'http://file.js', line: 5 }],
    }
    const result = formatStackTrace(trace)

    expect(result).toContain('at <anonymous> @ http://file.js:5')
  })
})

describe('formatFrame', () => {
  it('should format a full frame', () => {
    const frame: StackFrame = { func: 'foo', url: 'http://file.js', line: 10, column: 20 }

    expect(formatFrame(frame)).toBe('foo @ http://file.js:10:20')
  })

  it('should handle missing column', () => {
    const frame: StackFrame = { func: 'foo', url: 'http://file.js', line: 10 }

    expect(formatFrame(frame)).toBe('foo @ http://file.js:10')
  })

  it('should handle missing url', () => {
    const frame: StackFrame = { func: 'foo', line: 10 }

    expect(formatFrame(frame)).toBe('foo')
  })

  it('should handle native frames', () => {
    const frame: StackFrame = { func: 'Array.forEach', args: ['native'] }

    expect(formatFrame(frame)).toBe('Array.forEach(native)')
  })
})
