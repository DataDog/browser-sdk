import { computeStackTrace, computeStackTraceFromStackProp } from './computeStackTrace'

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
    const stackFrames = computeStackTraceFromStackProp(mockErr)!

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
    const stackFrames = computeStackTraceFromStackProp(mockErr)!

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
})
