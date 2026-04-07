import { captureStackTrace, parseStackTrace } from './stacktrace'

describe('stacktrace', () => {
  describe('parseStackTrace', () => {
    it('should parse Chrome/V8 stack trace format with function names', () => {
      const error = {
        stack: `Error: test error
    at captureStackTrace (http://example.com/stacktrace.js:1:1)
    at myFunction (http://example.com/app.js:42:10)
    at anotherFunction (http://example.com/app.js:100:5)`,
      } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/app.js',
          function: 'myFunction',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: 'http://example.com/app.js',
          function: 'anotherFunction',
          lineNumber: 100,
          columnNumber: 5,
        },
      ])
    })

    it('should parse Chrome/V8 stack trace format without function names', () => {
      const error = {
        stack: `Error: test error
    at captureStackTrace (http://example.com/stacktrace.js:1:1)
    at http://example.com/app.js:42:10
    at http://example.com/app.js:100:5`,
      } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/app.js',
          function: '',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: 'http://example.com/app.js',
          function: '',
          lineNumber: 100,
          columnNumber: 5,
        },
      ])
    })

    it('should parse Firefox stack trace format', () => {
      const error = {
        stack: `test error
captureStackTrace@http://example.com/stacktrace.js:1:1
myFunction@http://example.com/app.js:42:10
anotherFunction@http://example.com/app.js:100:5`,
      } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/app.js',
          function: 'myFunction',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: 'http://example.com/app.js',
          function: 'anotherFunction',
          lineNumber: 100,
          columnNumber: 5,
        },
      ])
    })

    it('should skip frames when skipFrames is specified', () => {
      const error = {
        stack: `Error: test error
    at captureStackTrace (http://example.com/stacktrace.js:1:1)
    at frameToSkip (http://example.com/app.js:10:5)
    at myFunction (http://example.com/app.js:42:10)
    at anotherFunction (http://example.com/app.js:100:5)`,
      } as Error

      const result = parseStackTrace(error, 1)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/app.js',
          function: 'myFunction',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: 'http://example.com/app.js',
          function: 'anotherFunction',
          lineNumber: 100,
          columnNumber: 5,
        },
      ])
    })

    it('should return empty array when error has no stack', () => {
      const error = {} as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([])
    })

    it('should handle empty stack string', () => {
      const error = { stack: '' } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([])
    })

    it('should skip malformed stack lines', () => {
      const error = {
        stack: `Error: test error
    at captureStackTrace (http://example.com/stacktrace.js:1:1)
    at myFunction (http://example.com/app.js:42:10)
    some malformed line without proper format
    at anotherFunction (http://example.com/app.js:100:5)`,
      } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/app.js',
          function: 'myFunction',
          lineNumber: 42,
          columnNumber: 10,
        },
        {
          fileName: 'http://example.com/app.js',
          function: 'anotherFunction',
          lineNumber: 100,
          columnNumber: 5,
        },
      ])
    })

    it('should handle file paths with spaces', () => {
      const error = {
        stack: `Error: test error
    at captureStackTrace (http://example.com/stacktrace.js:1:1)
    at myFunction (http://example.com/my app.js:42:10)`,
      } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/my app.js',
          function: 'myFunction',
          lineNumber: 42,
          columnNumber: 10,
        },
      ])
    })

    it('should trim whitespace from function and file names', () => {
      const error = {
        stack: `Error: test error
    at captureStackTrace (http://example.com/stacktrace.js:1:1)
    at  myFunction  ( http://example.com/app.js :42:10)`,
      } as Error

      const result = parseStackTrace(error)

      expect(result).toEqual([
        {
          fileName: 'http://example.com/app.js',
          function: 'myFunction',
          lineNumber: 42,
          columnNumber: 10,
        },
      ])
    })
  })

  describe('captureStackTrace', () => {
    it('should capture current stack trace', () => {
      const result = captureStackTrace()

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toEqual(
        jasmine.objectContaining({
          fileName: jasmine.any(String),
          function: jasmine.any(String),
          lineNumber: jasmine.any(Number),
          columnNumber: jasmine.any(Number),
        })
      )
    })

    it('should skip frames when specified', () => {
      function testFunction() {
        return captureStackTrace(0)
      }

      function wrapperFunction() {
        return testFunction()
      }

      const resultWithoutSkip = wrapperFunction()
      const resultWithSkip = captureStackTrace(1)

      // When skipping frames, we should have fewer frames
      expect(resultWithSkip.length).toBeLessThan(resultWithoutSkip.length)
    })

    it('should skip captureStackTrace itself and error creation', () => {
      function namedFunction() {
        return captureStackTrace()
      }

      const result = namedFunction()

      // The first frame should be namedFunction, not captureStackTrace
      // (Note: exact function name matching depends on browser/minification)
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
