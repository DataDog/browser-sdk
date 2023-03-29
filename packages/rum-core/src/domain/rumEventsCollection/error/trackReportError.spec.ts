import type { RawError, Subscription } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, Observable, clocksNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, stubReportingObserver } from '@datadog/browser-core/test'
import { trackReportError } from './trackReportError'

describe('trackReportError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: jasmine.Spy
  let clock: Clock
  let reportingObserverStub: { raiseReport(type: string): void; reset(): void }

  beforeEach(() => {
    errorObservable = new Observable()
    notifyLog = jasmine.createSpy('notifyLog')
    reportingObserverStub = stubReportingObserver()
    subscription = errorObservable.subscribe(notifyLog)
    clock = mockClock()
  })

  afterEach(() => {
    subscription.unsubscribe()
    clock.cleanup()
    reportingObserverStub.reset()
  })

  it('should track reports', () => {
    trackReportError(errorObservable)
    reportingObserverStub.raiseReport('intervention')

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: jasmine.any(String),
      stack: jasmine.any(String),
      source: ErrorSource.REPORT,
      handling: ErrorHandling.UNHANDLED,
      type: 'NavigatorVibrate',
    })
  })
})
