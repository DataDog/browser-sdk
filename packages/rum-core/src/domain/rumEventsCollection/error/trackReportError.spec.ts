import type { RawError, Subscription } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, Observable, clocksNow, isChromium } from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { mockClock } from '../../../../../core/test/specHelper'
import { stubReportingObserver } from '../../../../../core/test/stubReportApis'
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
    trackReportError(errorObservable)
    subscription = errorObservable.subscribe(notifyLog)
    clock = mockClock()
  })

  afterEach(() => {
    subscription.unsubscribe()
    clock.cleanup()
    reportingObserverStub.reset()
  })

  it('should error report', () => {
    if (!isChromium()) {
      pending('no ReportingObserver support')
    }

    reportingObserverStub.raiseReport('intervention')

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: jasmine.any(String),
      stack: jasmine.any(String),
      source: ErrorSource.REPORT,
      handling: ErrorHandling.HANDLED,
      type: 'intervention',
    })
  })
})
