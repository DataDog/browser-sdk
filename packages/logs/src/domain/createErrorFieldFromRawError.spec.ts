import { ErrorHandling, ErrorSource, type RawError, type RelativeTime, type TimeStamp } from '@datadog/browser-core'
import { createErrorFieldFromRawError } from './createErrorFieldFromRawError'

describe('createErrorFieldFromRawError', () => {
  const exhaustiveRawError: Required<RawError> = {
    startClocks: {
      relative: 0 as RelativeTime,
      timeStamp: 0 as TimeStamp,
    },
    source: ErrorSource.LOGGER,
    handling: ErrorHandling.HANDLED,
    handlingStack: 'Error\n    at foo (bar)',
    componentStack: 'at Flex',
    originalError: new Error('baz'),
    type: 'qux',
    message: 'quux',
    stack: 'quuz',
    causes: [
      {
        source: ErrorSource.CONSOLE,
        type: 'Error',
        stack: 'Error: Mid level error',
        message: 'Mid level error',
      },
      {
        source: ErrorSource.CONSOLE,
        type: 'TypeError',
        stack: 'TypeError: Low level error',
        message: 'Low level error',
      },
    ],
    fingerprint: 'corge',
    csp: {
      disposition: 'enforce',
    },
    context: {
      foo: 'bar',
    },
  }

  it('creates an error field from a raw error', () => {
    expect(createErrorFieldFromRawError(exhaustiveRawError)).toEqual({
      message: undefined,
      kind: 'qux',
      stack: 'quuz',
      causes: [
        {
          source: ErrorSource.CONSOLE,
          type: 'Error',
          stack: 'Error: Mid level error',
          message: 'Mid level error',
        },
        {
          source: ErrorSource.CONSOLE,
          type: 'TypeError',
          stack: 'TypeError: Low level error',
          message: 'Low level error',
        },
      ],
      fingerprint: 'corge',
      handling: ErrorHandling.HANDLED,
    })
  })

  it('includes the message if includeMessage is true', () => {
    expect(createErrorFieldFromRawError(exhaustiveRawError, { includeMessage: true }).message).toBe('quux')
  })
})
