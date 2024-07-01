import type { RawError, Subscription } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, Observable, clocksNow, resetConsoleObservable } from '@datadog/browser-core'
import { mockClock } from '@datadog/browser-core/test'
import { trackConsoleError } from './trackConsoleError'

describe('trackConsoleError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: jasmine.Spy

  beforeEach(() => {
    spyOn(console, 'error').and.callFake(() => true)
    errorObservable = new Observable()
    notifyLog = jasmine.createSpy('notifyLog')
    trackConsoleError(errorObservable)
    subscription = errorObservable.subscribe(notifyLog)
    mockClock()
  })

  afterEach(() => {
    resetConsoleObservable()
    subscription.unsubscribe()
  })

  it('should track console error', () => {
    // eslint-disable-next-line no-console
    console.error(new TypeError('foo'))

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: jasmine.any(String),
      stack: jasmine.any(String),
      fingerprint: undefined,
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      handlingStack: jasmine.any(String),
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
      message: jasmine.any(String),
      stack: jasmine.any(String),
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      handlingStack: jasmine.any(String),
      fingerprint: 'my-fingerprint',
    })
  })
})
