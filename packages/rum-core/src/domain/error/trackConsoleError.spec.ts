import { vi, afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { RawError, Subscription } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, Observable, clocksNow } from '@datadog/browser-core'
import { ignoreConsoleLogs, mockClock } from '@datadog/browser-core/test'
import { trackConsoleError } from './trackConsoleError'

describe('trackConsoleError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: Mock

  beforeEach(() => {
    ignoreConsoleLogs('error', 'Error: foo')
    errorObservable = new Observable()
    notifyLog = vi.fn()
    trackConsoleError(errorObservable)
    subscription = errorObservable.subscribe(notifyLog)
    mockClock()
  })

  afterEach(() => {
    subscription.unsubscribe()
  })

  it('should track console error', () => {
    const error = new TypeError('foo')

    // eslint-disable-next-line no-console
    console.error(error)

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: expect.any(String),
      stack: expect.any(String),
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      handlingStack: expect.any(String),
      fingerprint: undefined,
      causes: undefined,
      context: undefined,
      originalError: error,
      type: 'TypeError',
      componentStack: undefined,
    })
  })

  it('should retrieve fingerprint from console error', () => {
    interface DatadogError extends Error {
      dd_fingerprint?: string
    }
    const error = new Error('foo')
    ;(error as DatadogError).dd_fingerprint = 'my-fingerprint'

    // eslint-disable-next-line no-console
    console.error(error)

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: expect.any(String),
      stack: expect.any(String),
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      handlingStack: expect.any(String),
      fingerprint: 'my-fingerprint',
      causes: undefined,
      context: undefined,
      originalError: error,
      type: 'Error',
      componentStack: undefined,
    })
  })
})
