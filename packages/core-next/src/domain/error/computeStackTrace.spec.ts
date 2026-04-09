import { computeStackTrace } from './computeStackTrace'

describe('computeStackTrace', () => {
  it('should extract name and message from an Error', () => {
    const error = new TypeError('something went wrong')
    const result = computeStackTrace(error)

    expect(result.name).toBe('TypeError')
    expect(result.message).toBe('something went wrong')
  })

  it('should parse Chrome stack frames', () => {
    const error = {
      name: 'Error',
      message: 'test',
      stack: `Error: test
    at foo (http://localhost:8080/file.js:41:27)
    at bar (http://localhost:8080/file.js:107:5)`,
    }
    const result = computeStackTrace(error)

    expect(result.stack.length).toBe(2)
    expect(result.stack[0]).toEqual(
      jasmine.objectContaining({ func: 'foo', url: 'http://localhost:8080/file.js', line: 41, column: 27 })
    )
    expect(result.stack[1]).toEqual(
      jasmine.objectContaining({ func: 'bar', url: 'http://localhost:8080/file.js', line: 107, column: 5 })
    )
  })

  it('should parse Firefox stack frames', () => {
    const error = {
      name: 'Error',
      message: 'test',
      stack: `foo@http://localhost:8080/file.js:41:13
bar@http://localhost:8080/file.js:1:1`,
    }
    const result = computeStackTrace(error)

    expect(result.stack.length).toBe(2)
    expect(result.stack[0]).toEqual(
      jasmine.objectContaining({ func: 'foo', url: 'http://localhost:8080/file.js', line: 41, column: 13 })
    )
  })

  it('should mark anonymous functions as "?"', () => {
    const error = {
      name: 'Error',
      message: 'test',
      stack: `Error: test
    at http://localhost:8080/file.js:47:22`,
    }
    const result = computeStackTrace(error)

    expect(result.stack.length).toBe(1)
    expect(result.stack[0].func).toBe('?')
  })

  it('should handle real Error objects from the runtime', () => {
    const error = new Error('real error')
    const result = computeStackTrace(error)

    expect(result.name).toBe('Error')
    expect(result.message).toBe('real error')
    expect(result.stack.length).toBeGreaterThan(0)
    expect(result.stack[0].url).toBeDefined()
    expect(result.stack[0].line).toBeDefined()
  })

  it('should handle null/undefined input', () => {
    expect(computeStackTrace(null).stack).toEqual([])
    expect(computeStackTrace(undefined).stack).toEqual([])
  })

  it('should handle non-Error objects', () => {
    const result = computeStackTrace('just a string')

    expect(result.stack).toEqual([])
    expect(result.message).toBeUndefined()
  })

  it('should strip error message prefix from stack', () => {
    const error = {
      name: 'Error',
      message: 'test',
      stack: `Error: test
    at foo (http://localhost:8080/file.js:10:5)`,
      toString: () => 'Error: test',
    }
    const result = computeStackTrace(error)

    expect(result.stack.length).toBe(1)
    expect(result.stack[0].func).toBe('foo')
  })

  it('should handle Chrome eval stacks', () => {
    const error = {
      name: 'Error',
      message: 'test',
      stack: `Error: test
    at foo (eval at bar (http://localhost:8080/file.js:21:17), <anonymous>:1:30)`,
    }
    const result = computeStackTrace(error)

    expect(result.stack.length).toBe(1)
    expect(result.stack[0].func).toBe('foo')
  })

  it('should handle native frames in Chrome', () => {
    const error = {
      name: 'TypeError',
      message: 'test',
      stack: `TypeError: test
    at Array.forEach (native)
    at foo (http://localhost:8080/file.js:10:5)`,
    }
    const result = computeStackTrace(error)

    expect(result.stack.length).toBe(2)
    expect(result.stack[0].url).toBeUndefined()
    expect(result.stack[1].url).toBe('http://localhost:8080/file.js')
  })
})
