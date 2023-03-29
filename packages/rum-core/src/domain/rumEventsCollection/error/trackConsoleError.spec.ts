import type { RawError, Subscription } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, Observable, clocksNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { trackConsoleError } from './trackConsoleError'

describe('trackConsoleError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: jasmine.Spy
  let clock: Clock

  beforeEach(() => {
    spyOn(console, 'error').and.callFake(() => true)
    errorObservable = new Observable()
    notifyLog = jasmine.createSpy('notifyLog')
    trackConsoleError(errorObservable)
    subscription = errorObservable.subscribe(notifyLog)
    clock = mockClock()
  })

  afterEach(() => {
    subscription.unsubscribe()
    clock.cleanup()
  })

  it('should track console error', () => {
    // eslint-disable-next-line no-console
    console.error(new TypeError('foo'))

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: jasmine.any(String),
      stack: jasmine.any(String),
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      handlingStack: jasmine.any(String),
    })
  })
})
