import { isSafari } from '../../../test/specHelper'
import * as CapturedExceptions from '../../../test/capturedExceptions'
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
    const stackFrames = computeStackTrace(mockErr)!

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
    const stackFrames = computeStackTrace(mockErr)!

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
      args: [],
      column: undefined,
      func: '?',
      line: 48,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      func: 'dumpException3',
      line: 52,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      func: 'onclick',
      line: 82,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: undefined,
      url: '[native code]',
    })
  })

  it('should parse Safari 7 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_7)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 22,
      func: '?',
      line: 48,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 15,
      func: 'foo',
      line: 52,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 107,
      func: 'bar',
      line: 108,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Safari 8 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_8)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 22,
      func: '?',
      line: 47,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 15,
      func: 'foo',
      line: 52,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 23,
      func: 'bar',
      line: 108,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Safari 8 eval error', () => {
    // TODO: Take into account the line and column properties
    //  on the error object and use them for the first stack trace.
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_8_EVAL)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      func: 'eval',
      line: undefined,
      url: '[native code]',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 21,
      func: 'foo',
      line: 58,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 91,
      func: 'bar',
      line: 109,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Firefox 3 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_3)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 44,
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: ['null'],
      column: undefined,
      func: '?',
      line: 31,
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      func: 'printStackTrace',
      line: 18,
      url: 'http://127.0.0.1:8000/js/stacktrace.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: ['1'],
      column: undefined,
      func: 'bar',
      line: 13,
      url: 'http://127.0.0.1:8000/js/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: ['2'],
      column: undefined,
      func: 'bar',
      line: 16,
      url: 'http://127.0.0.1:8000/js/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: undefined,
      func: 'foo',
      line: 20,
      url: 'http://127.0.0.1:8000/js/file.js',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 24,
      url: 'http://127.0.0.1:8000/js/file.js',
    })
  })

  it('should parse Firefox 7 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_7)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 44,
      url: 'file:///G:/js/stacktrace.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: ['null'],
      column: undefined,
      func: '?',
      line: 31,
      url: 'file:///G:/js/stacktrace.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      func: 'printStackTrace',
      line: 18,
      url: 'file:///G:/js/stacktrace.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: ['1'],
      column: undefined,
      func: 'bar',
      line: 13,
      url: 'file:///G:/js/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: ['2'],
      column: undefined,
      func: 'bar',
      line: 16,
      url: 'file:///G:/js/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: undefined,
      func: 'foo',
      line: 20,
      url: 'file:///G:/js/file.js',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 24,
      url: 'file:///G:/js/file.js',
    })
  })

  it('should parse Firefox 14 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_14)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 48,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      func: 'dumpException3',
      line: 52,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      func: 'onclick',
      line: 1,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Firefox 31 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_31)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 13,
      func: 'foo',
      line: 41,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 1,
      func: 'bar',
      line: 1,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 1,
      func: '.plugin/e.fn[c]/<',
      line: 1,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Firefox 44 ns exceptions', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_44_NS_EXCEPTION)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 28,
      func: '[2]</Bar.prototype._baz/</<',
      line: 703,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 2,
      func: 'App.prototype.foo',
      line: 15,
      url: 'file:///path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 3,
      func: 'bar',
      line: 20,
      url: 'file:///path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: 1,
      func: '?',
      line: 23,
      url: 'file:///path/to/index.html',
    })
  })

  it('should parse Chrome error with no location', () => {
    const error = { stack: 'error\n at Array.forEach (native)' }
    const stackFrames = computeStackTrace(error as Error)
    expect(stackFrames.stack.length).toEqual(1)
    expect(stackFrames.stack[0]).toEqual({
      args: ['native'],
      column: undefined,
      func: 'Array.forEach',
      line: undefined,
      url: undefined,
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
      args: [],
      column: 12,
      func: 'foo$bar$oof$rab',
      line: 1060,
      url: 'events.cljs',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 19,
      func: 'func1$func2$func3$func4',
      line: 128,
      url: 'std_interceptors.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 29,
      func: 'eval',
      line: 132,
      url: 'std_interceptors.jsx',
    })
  })

  it('should not include error message into stacktrace ', () => {
    const stackFrames = computeStackTrace(new Error('bar@http://path/to/file.js:1:1'))

    expect(stackFrames.stack[0].url).not.toBe('http://path/to/file.js')
  })

  it('should parse Chrome anonymous function errors', () => {
    const stack = `Error: RTE Simulation
    at https://datadoghq.com/somefile.js:8489:191
    at chrome-extension://<id>/content/index.js:85:37379`

    const stackFrames = computeStackTrace({ stack } as Error)
    expect(stackFrames.stack.length).toEqual(2)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 191,
      func: '?',
      line: 8489,
      url: 'https://datadoghq.com/somefile.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 37379,
      func: '?',
      line: 85,
      url: 'chrome-extension://<id>/content/index.js',
    })
  })

  it('should parse Chrome 15 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_15 as any)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 17,
      func: 'bar',
      line: 13,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 5,
      func: 'bar',
      line: 16,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 5,
      func: 'foo',
      line: 20,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: 4,
      func: '?',
      line: 24,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Chrome 36 error with port numbers', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_36)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 27,
      func: 'dumpExceptionError',
      line: 41,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 146,
      func: 'HTMLButtonElement.onclick',
      line: 107,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 3651,
      func: 'I.e.fn.(anonymous function) [as index]',
      line: 10,
      url: 'http://localhost:8080/file.js',
    })
  })

  it('should parse Chrome error with webpack URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_XX_WEBPACK)

    expect(stackFrames.stack.length).toEqual(4)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 108,
      func: 'TESTTESTTEST.eval',
      line: 295,
      url: 'webpack:///./src/components/test/test.jsx?',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 32,
      func: 'TESTTESTTEST.render',
      line: 272,
      url: 'webpack:///./src/components/test/test.jsx?',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 31,
      func: 'TESTTESTTEST.tryRender',
      line: 34,
      url: 'webpack:///./~/react-transform-catch-errors/lib/index.js?',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: 30,
      func: 'TESTTESTTEST.proxiedMethod',
      line: 44,
      url: 'webpack:///./~/react-proxy/modules/createPrototypeProxy.js?',
    })
  })

  it('should parse nested eval() from Chrome', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_48_EVAL)

    expect(stackFrames.stack.length).toEqual(5)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 17,
      func: 'baz',
      line: 21,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 17,
      func: 'foo',
      line: 21,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 17,
      func: 'eval',
      line: 21,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: 17,
      func: 'Object.speak',
      line: 21,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: 13,
      func: '?',
      line: 31,
      url: 'http://localhost:8080/file.js',
    })
  })

  it('should parse Chrome error with blob URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.CHROME_48_BLOB)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 29146,
      func: 's',
      line: 31,
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 30039,
      func: 'Object.d [as add]',
      line: 31,
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: 10978,
      func: '?',
      line: 15,
      url: 'blob:http%3A//localhost%3A8080/d4eefe0f-361a-4682-b217-76587d9f712a',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: 6911,
      func: '?',
      line: 1,
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: 3019,
      func: 'n.fire',
      line: 7,
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: 2863,
      func: 'n.handle',
      line: 7,
      url: 'blob:http%3A//localhost%3A8080/abfc40e9-4742-44ed-9dcd-af8f99a29379',
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
      args: [],
      column: 13,
      func: 'Anonymous function',
      line: 48,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 9,
      func: 'foo',
      line: 46,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 1,
      func: 'bar',
      line: 82,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse IE 11 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IE_11)

    expect(stackFrames.stack.length).toEqual(3)
    // TODO: func should be normalized
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 21,
      func: 'Anonymous function',
      line: 47,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 13,
      func: 'foo',
      line: 45,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 1,
      func: 'bar',
      line: 108,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse IE 11 eval error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IE_11_EVAL)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 1,
      func: 'eval code',
      line: 1,
      url: 'eval code',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 17,
      func: 'foo',
      line: 58,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 1,
      func: 'bar',
      line: 109,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 25 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_25)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 22,
      func: '?',
      line: 47,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 15,
      func: 'foo',
      line: 52,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: 168,
      func: 'bar',
      line: 108,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse PhantomJS 1.19 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.PHANTOMJS_1_19 as Error)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 878,
      url: 'file:///path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      func: 'foo',
      line: 4283,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 4287,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Firefox errors with resource: URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_50_RESOURCE_URL)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 16,
      func: 'render',
      line: 5529,
      url: 'resource://path/data/content/bundle.js',
    })
  })

  it('should parse Firefox errors with eval URLs', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_43_EVAL as any)

    expect(stackFrames.stack.length).toEqual(5)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      func: 'baz',
      line: 26,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      func: 'foo',
      line: 26,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: 26,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: 17,
      func: 'speak',
      line: 26,
      url: 'http://localhost:8080/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: 9,
      func: '?',
      line: 33,
      url: 'http://localhost:8080/file.js',
    })
  })

  it('should parse React Native errors on Android', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.ANDROID_REACT_NATIVE)

    expect(stackFrames.stack.length).toEqual(8)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 24,
      func: 'render',
      line: 78,
      url: '/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js',
    })
    expect(stackFrames.stack[7]).toEqual({
      args: [],
      column: 41,
      func: 'this',
      line: 74,
      url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
    })
  })

  it('should parse React Native errors on Android Production', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.ANDROID_REACT_NATIVE_PROD)

    expect(stackFrames.stack.length).toEqual(37)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 1917,
      func: 'value',
      line: 12,
      url: 'index.android.bundle',
    })
    expect(stackFrames.stack[35]).toEqual({
      args: [],
      column: 927,
      func: 'value',
      line: 29,
      url: 'index.android.bundle',
    })
    expect(stackFrames.stack[36]).toEqual({
      args: [],
      column: undefined,
      func: '?',
      line: undefined,
      url: '[native code]',
    })
  })

  it('should parse iOS capacitor', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.IOS_CAPACITOR)

    expect(stackFrames.stack.length).toEqual(2)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 99546,
      func: '?',
      line: 34,
      url: 'capacitor://localhost/media/dist/bundle.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 47950,
      func: 'r',
      line: 34,
      url: 'capacitor://localhost/media/dist/bundle.js',
    })
  })
})
