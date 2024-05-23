import { isSafari } from '../utils/browserDetection'
import * as CapturedExceptions from './capturedExceptions.specHelper'
import { computeStackTrace } from './computeStackTrace'

describe('computeStackTrace', () => {
  it('should not remove anonymous functions from the stack', () => {
    // mock up an error object with a stack trace that includes both
    // named functions and anonymous functions
    const stack = `
  Error:
    at new <anonymous> (http://example.com/js/test.js:63:1)
    at namedFunc0 (http://example.com/js/script.js:10:2)
    at http://example.com/js/test.js:65:10
    at namedFunc2 (http://example.com/js/script.js:20:5)
    at http://example.com/js/test.js:67:5
    at namedFunc4 (http://example.com/js/script.js:100001:10002)`
    const mockErr: any = { stack }
    const stackFrames = computeStackTrace(mockErr)

    expect(stackFrames.stack[0].func).toEqual('new <anonymous>')
    expect(stackFrames.stack[0].url).toEqual('http://example.com/js/test.js')
    expect(stackFrames.stack[0].line).toEqual(63)
    expect(stackFrames.stack[0].column).toEqual(1)
    expect(stackFrames.stack[1].func).toEqual('namedFunc0')
    expect(stackFrames.stack[1].url).toEqual('http://example.com/js/script.js')
    expect(stackFrames.stack[1].line).toEqual(10)
    expect(stackFrames.stack[1].column).toEqual(2)

    expect(stackFrames.stack[2].func).toEqual('?')
    expect(stackFrames.stack[2].url).toEqual('http://example.com/js/test.js')
    expect(stackFrames.stack[2].line).toEqual(65)
    expect(stackFrames.stack[2].column).toEqual(10)

    expect(stackFrames.stack[3].func).toEqual('namedFunc2')
    expect(stackFrames.stack[3].url).toEqual('http://example.com/js/script.js')
    expect(stackFrames.stack[3].line).toEqual(20)
    expect(stackFrames.stack[3].column).toEqual(5)

    expect(stackFrames.stack[4].func).toEqual('?')
    expect(stackFrames.stack[4].url).toEqual('http://example.com/js/test.js')
    expect(stackFrames.stack[4].line).toEqual(67)
    expect(stackFrames.stack[4].column).toEqual(5)

    expect(stackFrames.stack[5].func).toEqual('namedFunc4')
    expect(stackFrames.stack[5].url).toEqual('http://example.com/js/script.js')
    expect(stackFrames.stack[5].line).toEqual(100001)
    expect(stackFrames.stack[5].column).toEqual(10002)
  })

  it('should handle eval/anonymous strings in Chrome 46', () => {
    const stack = `
ReferenceError: baz is not defined
   at bar (http://example.com/js/test.js:19:7)
   at foo (http://example.com/js/test.js:23:7)
   at eval (eval at <anonymous> (http://example.com/js/test.js:26:5)).toEqual(<anonymous>:1:26)
`

    const mockErr: any = { stack }
    const stackFrames = computeStackTrace(mockErr)

    expect(stackFrames.stack[0].func).toEqual('bar')
    expect(stackFrames.stack[0].url).toEqual('http://example.com/js/test.js')
    expect(stackFrames.stack[0].line).toEqual(19)
    expect(stackFrames.stack[0].column).toEqual(7)

    expect(stackFrames.stack[1].func).toEqual('foo')
    expect(stackFrames.stack[1].url).toEqual('http://example.com/js/test.js')
    expect(stackFrames.stack[1].line).toEqual(23)
    expect(stackFrames.stack[1].column).toEqual(7)

    expect(stackFrames.stack[2].func).toEqual('eval')
    // TODO: fix nested evals
    expect(stackFrames.stack[2].url).toEqual('http://example.com/js/test.js')
    expect(stackFrames.stack[2].line).toEqual(26)
    expect(stackFrames.stack[2].column).toEqual(5)
  })

  const stackStr = `
Error: foo
    at <anonymous>:2:11
    at Object.InjectedScript._evaluateOn (<anonymous>:904:140)
    at Object.InjectedScript._evaluateAndWrap (<anonymous>:837:34)
    at Object.InjectedScript.evaluate (<anonymous>:693:21)`

  it('should handle a native error object', () => {
    const ex = new Error('test')
    const stack = computeStackTrace(ex)
    expect(stack.name).toEqual('Error')
    expect(stack.message).toEqual('test')
  })

  it('should handle a native error object stack from Chrome', () => {
    const mockErr = {
      message: 'foo',
      name: 'Error',
      stack: stackStr,
    }
    const stackFrames = computeStackTrace(mockErr)

    expect(stackFrames.stack[0].url).toEqual('<anonymous>')
  })

  it('should handle edge case values', () => {
    expect(computeStackTrace({ message: { foo: 'bar' } }).message).toBeUndefined()
    expect(computeStackTrace({ name: { foo: 'bar' } }).name).toBeUndefined()
    expect(computeStackTrace({ message: { foo: 'bar' }, stack: stackStr }).message).toBeUndefined()
    expect(computeStackTrace({ name: { foo: 'bar' }, stack: stackStr }).name).toBeUndefined()
    expect(computeStackTrace(2).message).toBeUndefined()
    expect(computeStackTrace({ foo: 'bar' }).message).toBeUndefined()
    expect(computeStackTrace(undefined).message).toBeUndefined()
    expect(computeStackTrace(null).message).toBeUndefined()
  })

  it('should get the order of functions called right', () => {
    if (isSafari()) {
      pending()
    }
    function foo() {
      return bar()
    }

    function bar() {
      return baz()
    }

    function baz() {
      try {
        // Throw error for IE
        throw new Error()
      } catch (ex) {
        return computeStackTrace(ex)
      }
    }

    const trace = foo()
    const expected = ['baz', 'bar', 'foo']

    for (let i = 0; i <= 2; i += 1) {
      expect(trace.stack[i].func).toEqual(expected[i])
    }
  })

  it('should parse Safari 6 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_6)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'dumpException3',
      args: [],
      line: 52,
      column: undefined,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'onclick',
      args: [],
      line: 82,
      column: undefined,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: '[native code]',
      func: '?',
      args: [],
      line: undefined,
      column: undefined,
    })
  })

  it('should parse Safari 7 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_7)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: 22,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 107,
    })
  })

  it('should parse Safari 8 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_8)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 47,
      column: 22,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 23,
    })
  })

  it('should parse Safari 8 eval error', () => {
    // TODO: Take into account the line and column properties
    //  on the error object and use them for the first stack trace.
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_8_EVAL)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: '[native code]',
      func: 'eval',
      args: [],
      line: undefined,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 58,
      column: 21,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 109,
      column: 91,
    })
  })

  it('should parse Firefox 3 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_3)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: '?',
      args: [],
      line: 44,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: '?',
      args: ['null'],
      line: 31,
      column: undefined,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: undefined,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'bar',
      args: ['1'],
      line: 13,
      column: undefined,
    })
    expect(stackFrames.stack[4]).toEqual({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'bar',
      args: ['2'],
      line: 16,
      column: undefined,
    })
    expect(stackFrames.stack[5]).toEqual({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: undefined,
    })
    expect(stackFrames.stack[6]).toEqual({
      url: 'http://127.0.0.1:8000/js/file.js',
      func: '?',
      args: [],
      line: 24,
      column: undefined,
    })
  })

  it('should parse Firefox 7 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_7)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      url: 'file:///G:/js/stacktrace.js',
      func: '?',
      args: [],
      line: 44,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'file:///G:/js/stacktrace.js',
      func: '?',
      args: ['null'],
      line: 31,
      column: undefined,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'file:///G:/js/stacktrace.js',
      func: 'printStackTrace',
      args: [],
      line: 18,
      column: undefined,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'file:///G:/js/file.js',
      func: 'bar',
      args: ['1'],
      line: 13,
      column: undefined,
    })
    expect(stackFrames.stack[4]).toEqual({
      url: 'file:///G:/js/file.js',
      func: 'bar',
      args: ['2'],
      line: 16,
      column: undefined,
    })
    expect(stackFrames.stack[5]).toEqual({
      url: 'file:///G:/js/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: undefined,
    })
    expect(stackFrames.stack[6]).toEqual({
      url: 'file:///G:/js/file.js',
      func: '?',
      args: [],
      line: 24,
      column: undefined,
    })
  })

  it('should parse Firefox 14 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_14)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 48,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'dumpException3',
      args: [],
      line: 52,
      column: undefined,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'onclick',
      args: [],
      line: 1,
      column: undefined,
    })
  })

  it('should parse Firefox 31 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_31)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 41,
      column: 13,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 1,
      column: 1,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: '.plugin/e.fn[c]/<',
      args: [],
      line: 1,
      column: 1,
    })
  })

  it('should parse Firefox 44 ns exceptions', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_44_NS_EXCEPTION)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: '[2]</Bar.prototype._baz/</<',
      args: [],
      line: 703,
      column: 28,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'file:///path/to/file.js',
      func: 'App.prototype.foo',
      args: [],
      line: 15,
      column: 2,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'file:///path/to/file.js',
      func: 'bar',
      args: [],
      line: 20,
      column: 3,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'file:///path/to/index.html',
      func: '?',
      args: [],
      line: 23,
      column: 1,
    })
  })

  it('should parse Chrome error with no location', () => {
    const error = { stack: 'error\n at Array.forEach (native)' }
    const stackFrames = computeStackTrace(error as Error)
    expect(stackFrames.stack.length).toEqual(1)
    expect(stackFrames.stack[0]).toEqual({
      url: undefined,
      func: 'Array.forEach',
      args: ['native'],
      line: undefined,
      column: undefined,
    })
  })

  it('should parse Chrome error that only contain file name, with no path prefix', () => {
    const stack = `Error: RTE Simulation
    at foo$bar$oof$rab (events.cljs:1060:12)
    at func1$func2$func3$func4 (std_interceptors.js:128:19)
    at eval (std_interceptors.jsx:132:29)`

    const stackFrames = computeStackTrace({ stack } as Error)
    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'events.cljs',
      func: 'foo$bar$oof$rab',
      args: [],
      line: 1060,
      column: 12,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'std_interceptors.js',
      func: 'func1$func2$func3$func4',
      args: [],
      line: 128,
      column: 19,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'std_interceptors.jsx',
      func: 'eval',
      args: [],
      line: 132,
      column: 29,
    })
  })

  it('should not include error message into stacktrace ', () => {
    const stackFrames = computeStackTrace(new Error('bar@http://path/to/file.js:1:1'))

    expect(stackFrames.stack[0]?.url).not.toBe('http://path/to/file.js')
  })

  it('should parse Chrome anonymous function errors', () => {
    const stack = `Error: RTE Simulation
    at https://datadoghq.com/somefile.js:8489:191
    at chrome-extension://<id>/content/index.js:85:37379`

    const stackFrames = computeStackTrace({ stack } as Error)
    expect(stackFrames.stack.length).toEqual(2)
    expect(stackFrames.stack[0]).toEqual({
      url: 'https://datadoghq.com/somefile.js',
      func: '?',
      args: [],
      line: 8489,
      column: 191,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'chrome-extension://<id>/content/index.js',
      func: '?',
      args: [],
      line: 85,
      column: 37379,
    })
  })

  it('should parse Chrome 15 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_15 as any)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 13,
      column: 17,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 16,
      column: 5,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 20,
      column: 5,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 24,
      column: 4,
    })
  })

  it('should parse Chrome 36 error with port numbers', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_36)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'dumpExceptionError',
      args: [],
      line: 41,
      column: 27,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'HTMLButtonElement.onclick',
      args: [],
      line: 107,
      column: 146,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'I.e.fn.(anonymous function) [as index]',
      args: [],
      line: 10,
      column: 3651,
    })
  })

  it('should parse Chrome error with webpack URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_XX_WEBPACK)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      url: 'webpack:///./src/components/test/test.jsx?',
      func: 'TESTTESTTEST.eval',
      args: [],
      line: 295,
      column: 108,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'webpack:///./src/components/test/test.jsx?',
      func: 'TESTTESTTEST.render',
      args: [],
      line: 272,
      column: 32,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'webpack:///./~/react-transform-catch-errors/lib/index.js?',
      func: 'TESTTESTTEST.tryRender',
      args: [],
      line: 34,
      column: 31,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'webpack:///./~/react-proxy/modules/createPrototypeProxy.js?',
      func: 'TESTTESTTEST.proxiedMethod',
      args: [],
      line: 44,
      column: 30,
    })
  })

  it('should parse nested eval() from Chrome', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_48_EVAL)

    expect(stackFrames.stack.length).toEqual(5)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'baz',
      args: [],
      line: 21,
      column: 17,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'foo',
      args: [],
      line: 21,
      column: 17,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'eval',
      args: [],
      line: 21,
      column: 17,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'Object.speak',
      args: [],
      line: 21,
      column: 17,
    })
    expect(stackFrames.stack[4]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 31,
      column: 13,
    })
  })

  it('should parse Chrome error with blob URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_48_BLOB)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[1]).toEqual({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 's',
      args: [],
      line: 31,
      column: 29146,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'Object.d [as add]',
      args: [],
      line: 31,
      column: 30039,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a',
      func: '?',
      args: [],
      line: 15,
      column: 10978,
    })
    expect(stackFrames.stack[4]).toEqual({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: '?',
      args: [],
      line: 1,
      column: 6911,
    })
    expect(stackFrames.stack[5]).toEqual({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'n.fire',
      args: [],
      line: 7,
      column: 3019,
    })
    expect(stackFrames.stack[6]).toEqual({
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
      func: 'n.handle',
      args: [],
      line: 7,
      column: 2863,
    })
  })

  it('should parse errors from Chrome Snippets', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_111_SNIPPET)

    expect(stackFrames.stack.length).toEqual(1)
    expect(stackFrames.stack[0]).toEqual({
      url: 'snippet:///snippet_file',
      func: '?',
      args: [],
      line: 1,
      column: 13,
    })
  })

  it('should parse empty IE 9 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IE_9)

    if (stackFrames.stack) {
      expect(stackFrames.stack.length).toEqual(0)
    }
  })

  it('should parse IE 10 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IE_10 as any)

    expect(stackFrames.stack.length).toEqual(3)
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: 'Anonymous function',
      args: [],
      line: 48,
      column: 13,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 46,
      column: 9,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 82,
      column: 1,
    })
  })

  it('should parse IE 11 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IE_11)

    expect(stackFrames.stack.length).toEqual(3)
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: 'Anonymous function',
      args: [],
      line: 47,
      column: 21,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 45,
      column: 13,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 1,
    })
  })

  it('should parse IE 11 eval error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IE_11_EVAL)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'eval code',
      func: 'eval code',
      args: [],
      line: 1,
      column: 1,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 58,
      column: 17,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 109,
      column: 1,
    })
  })

  it('should parse Opera 25 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_25)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 47,
      column: 22,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 52,
      column: 15,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: 'bar',
      args: [],
      line: 108,
      column: 168,
    })
  })

  it('should parse PhantomJS 1.19 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.PHANTOMJS_1_19 as Error)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'file:///path/to/file.js',
      func: '?',
      args: [],
      line: 878,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://path/to/file.js',
      func: 'foo',
      args: [],
      line: 4283,
      column: undefined,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://path/to/file.js',
      func: '?',
      args: [],
      line: 4287,
      column: undefined,
    })
  })

  it('should parse Firefox errors with resource: URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_50_RESOURCE_URL)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      url: 'resource://path/data/content/bundle.js',
      func: 'render',
      args: [],
      line: 5529,
      column: 16,
    })
  })

  it('should parse Firefox errors with eval URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_43_EVAL as any)

    expect(stackFrames.stack.length).toEqual(5)
    expect(stackFrames.stack[0]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'baz',
      args: [],
      line: 26,
      column: undefined,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'foo',
      args: [],
      line: 26,
      column: undefined,
    })
    expect(stackFrames.stack[2]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 26,
      column: undefined,
    })
    expect(stackFrames.stack[3]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: 'speak',
      args: [],
      line: 26,
      column: 17,
    })
    expect(stackFrames.stack[4]).toEqual({
      url: 'http://localhost:8080/file.js',
      func: '?',
      args: [],
      line: 33,
      column: 9,
    })
  })

  it('should parse React Native errors on Android', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.ANDROID_REACT_NATIVE)

    expect(stackFrames.stack.length).toEqual(8)
    expect(stackFrames.stack[0]).toEqual({
      url: '/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js',
      func: 'render',
      args: [],
      line: 78,
      column: 24,
    })
    expect(stackFrames.stack[7]).toEqual({
      url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
      func: 'this',
      args: [],
      line: 74,
      column: 41,
    })
  })

  it('should parse React Native errors on Android Production', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.ANDROID_REACT_NATIVE_PROD)

    expect(stackFrames.stack.length).toEqual(37)
    expect(stackFrames.stack[0]).toEqual({
      url: 'index.android.bundle',
      func: 'value',
      args: [],
      line: 12,
      column: 1917,
    })
    expect(stackFrames.stack[35]).toEqual({
      url: 'index.android.bundle',
      func: 'value',
      args: [],
      line: 29,
      column: 927,
    })
    expect(stackFrames.stack[36]).toEqual({
      url: '[native code]',
      func: '?',
      args: [],
      line: undefined,
      column: undefined,
    })
  })

  it('should parse iOS capacitor', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IOS_CAPACITOR)

    expect(stackFrames.stack.length).toEqual(2)
    expect(stackFrames.stack[0]).toEqual({
      url: 'capacitor://localhost/media/dist/bundle.js',
      func: '?',
      args: [],
      line: 34,
      column: 99546,
    })
    expect(stackFrames.stack[1]).toEqual({
      url: 'capacitor://localhost/media/dist/bundle.js',
      func: 'r',
      args: [],
      line: 34,
      column: 47950,
    })
  })
})
