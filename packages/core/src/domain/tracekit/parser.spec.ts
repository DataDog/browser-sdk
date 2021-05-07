import * as CapturedExceptions from '../../../test/capturedExceptions'
import { isSafari } from '../../../test/specHelper'
import { computeStackTrace, computeStackTraceOfCaller } from './computeStackTrace'
import { BrowserError } from './types'

describe('Parser', () => {
  function foo() {
    return bar()
  }

  function bar() {
    return baz()
  }

  function baz() {
    return computeStackTraceOfCaller()
  }

  it('should get the order of functions called right', () => {
    if (isSafari()) {
      pending()
    }
    const trace = foo()
    const expected = ['baz', 'bar', 'foo']

    for (let i = 1; i <= 3; i += 1) {
      expect(trace.stack[i].func).toEqual(expected[i - 1])
    }
  })

  it('should parse Safari 6 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.SAFARI_6 as BrowserError)

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
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_7 as BrowserError)

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
    const stackFrames = computeStackTrace(CapturedExceptions.FIREFOX_14 as BrowserError)

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
    const stackFrames = computeStackTrace(CapturedExceptions.IE_9 as BrowserError)

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

  it('should parse Opera 8.54 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_854 as any)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      context: ['    this.undef();'],
      func: '?',
      line: 44,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      context: ['    ex = ex || this.createException();'],
      func: '?',
      line: 31,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      context: ['    var p = new printStackTrace.implementation(), result = p.run(ex);'],
      func: '?',
      line: 18,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: undefined,
      context: ['    printTrace(printStackTrace());'],
      func: '?',
      line: 4,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: undefined,
      context: ['    bar(n - 1);'],
      func: '?',
      line: 7,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: undefined,
      context: ['    bar(2);'],
      func: '?',
      line: 11,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: undefined,
      context: ['    foo();'],
      func: '?',
      line: 15,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 9.02 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_902 as any)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      context: ['    this.undef();'],
      func: '?',
      line: 44,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      context: ['    ex = ex || this.createException();'],
      func: '?',
      line: 31,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      context: ['    var p = new printStackTrace.implementation(), result = p.run(ex);'],
      func: '?',
      line: 18,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: undefined,
      context: ['    printTrace(printStackTrace());'],
      func: '?',
      line: 4,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: undefined,
      context: ['    bar(n - 1);'],
      func: '?',
      line: 7,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: undefined,
      context: ['    bar(2);'],
      func: '?',
      line: 11,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: undefined,
      context: ['    foo();'],
      func: '?',
      line: 15,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 9.27 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_927 as any)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      context: ['    bar(n - 1);'],
      func: '?',
      line: 43,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      context: ['    bar(2);'],
      func: '?',
      line: 31,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      context: ['    foo();'],
      func: '?',
      line: 18,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 9.64 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_964 as any)

    expect(stackFrames.stack.length).toEqual(6)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      context: ['            ex = ex || this.createException();'],
      func: '?',
      line: 27,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      context: ['        var p = new printStackTrace.implementation(), result = p.run(ex);'],
      func: 'printStackTrace',
      line: 18,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      context: ['             printTrace(printStackTrace());'],
      func: 'bar',
      line: 4,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: undefined,
      context: ['           bar(n - 1);'],
      func: 'bar',
      line: 7,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: undefined,
      context: ['           bar(2);'],
      func: 'foo',
      line: 11,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: undefined,
      context: ['         foo();'],
      func: '?',
      line: 15,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 10 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_10 as any)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: undefined,
      context: ['                this.undef();'],
      func: '?',
      line: 42,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: undefined,
      context: ['            ex = ex || this.createException();'],
      func: '?',
      line: 27,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: [],
      column: undefined,
      context: ['        var p = new printStackTrace.implementation(), result = p.run(ex);'],
      func: 'printStackTrace',
      line: 18,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: [],
      column: undefined,
      context: ['             printTrace(printStackTrace());'],
      func: 'bar',
      line: 4,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: [],
      column: undefined,
      context: ['           bar(n - 1);'],
      func: 'bar',
      line: 7,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: undefined,
      context: ['           bar(2);'],
      func: 'foo',
      line: 11,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: undefined,
      context: ['         foo();'],
      func: '?',
      line: 15,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 11 error', () => {
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_11 as any)

    expect(stackFrames.stack.length).toEqual(7)
    expect(stackFrames.stack[0]).toEqual({
      args: [],
      column: 12,
      context: ['    this.undef();'],
      func: 'createException',
      line: 42,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: ['ex'],
      column: 8,
      context: ['    ex = ex || this.createException();'],
      func: 'run',
      line: 27,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: ['options'],
      column: 4,
      context: ['    var p = new printStackTrace.implementation(), result = p.run(ex);'],
      func: 'printStackTrace',
      line: 18,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[3]).toEqual({
      args: ['n'],
      column: 5,
      context: ['    printTrace(printStackTrace());'],
      func: 'bar',
      line: 4,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[4]).toEqual({
      args: ['n'],
      column: 4,
      context: ['    bar(n - 1);'],
      func: 'bar',
      line: 7,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[5]).toEqual({
      args: [],
      column: 4,
      context: ['    bar(2);'],
      func: 'foo',
      line: 11,
      url: 'http://path/to/file.js',
    })
    expect(stackFrames.stack[6]).toEqual({
      args: [],
      column: 3,
      context: ['    foo();'],
      func: '?',
      line: 15,
      url: 'http://path/to/file.js',
    })
  })

  it('should parse Opera 12 error', () => {
    // TODO: Improve anonymous function name.
    const stackFrames = computeStackTrace(CapturedExceptions.OPERA_12 as any)

    expect(stackFrames.stack.length).toEqual(3)
    expect(stackFrames.stack[0]).toEqual({
      args: ['x'],
      column: 12,
      context: ['    x.undef();'],
      func: '<anonymous function>',
      line: 48,
      url: 'http://localhost:8000/ExceptionLab.html',
    })
    expect(stackFrames.stack[1]).toEqual({
      args: [],
      column: 8,
      context: ['    dumpException((function(x) {'],
      func: 'dumpException3',
      line: 46,
      url: 'http://localhost:8000/ExceptionLab.html',
    })
    expect(stackFrames.stack[2]).toEqual({
      args: ['event'],
      column: 0,
      context: ['    dumpException3();'],
      func: '<anonymous function>',
      line: 1,
      url: 'http://localhost:8000/ExceptionLab.html',
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
      url:
        // eslint-disable-next-line  max-len
        '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
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
