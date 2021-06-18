import { StackTrace } from '../domain/tracekit'
import { createHandlingStack, formatUnknownError } from './error'

describe('formatUnknownError', () => {
  const NOT_COMPUTED_STACK_TRACE: StackTrace = { name: undefined, message: undefined, stack: [] } as any

  it('should format an error', () => {
    const stack: StackTrace = {
      message: 'oh snap!',
      name: 'TypeError',
      stack: [
        {
          args: ['1', 'bar'],
          column: 15,
          func: 'foo',
          line: 52,
          url: 'http://path/to/file.js',
        },
        {
          args: [],
          column: undefined,
          func: '?',
          line: 12,
          url: 'http://path/to/file.js',
        },
        {
          args: ['baz'],
          column: undefined,
          func: '?',
          line: undefined,
          url: 'http://path/to/file.js',
        },
      ],
    }

    const formatted = formatUnknownError(stack, undefined, 'Uncaught')

    expect(formatted.message).toEqual('oh snap!')
    expect(formatted.type).toEqual('TypeError')
    expect(formatted.stack).toEqual(`TypeError: oh snap!
  at foo(1, bar) @ http://path/to/file.js:52:15
  at <anonymous> @ http://path/to/file.js:12
  at <anonymous>(baz) @ http://path/to/file.js`)
  })

  it('should format an error with an empty message', () => {
    const stack: StackTrace = {
      message: '',
      name: 'TypeError',
      stack: [],
    }

    const formatted = formatUnknownError(stack, undefined, 'Uncaught')

    expect(formatted.message).toEqual('Empty message')
  })

  it('should format a string error', () => {
    const errorObject = 'oh snap!'

    const formatted = formatUnknownError(NOT_COMPUTED_STACK_TRACE, errorObject, 'Uncaught')

    expect(formatted.message).toEqual('Uncaught "oh snap!"')
  })

  it('should format an object error', () => {
    const errorObject = { foo: 'bar' }

    const formatted = formatUnknownError(NOT_COMPUTED_STACK_TRACE, errorObject, 'Uncaught')

    expect(formatted.message).toEqual('Uncaught {"foo":"bar"}')
  })
})

describe('createHandlingStack', () => {
  let handlingStack: string
  function internalCall() {
    handlingStack = createHandlingStack()
  }
  function userCallTwo() {
    internalCall()
  }
  function userCallOne() {
    userCallTwo()
  }

  it('should create handling stack trace without internal calls', () => {
    userCallOne()

    expect(handlingStack).toMatch(`Error: 
  at userCallTwo @ (.*)
  at userCallOne @ (.*)`)
  })
})
