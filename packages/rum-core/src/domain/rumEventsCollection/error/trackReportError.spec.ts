import type { RawError, Subscription } from '@datadog/browser-core'
import {
  ErrorHandling,
  ErrorSource,
  Observable,
  clocksNow,
  updateExperimentalFeatures,
  resetExperimentalFeatures,
} from '@datadog/browser-core'
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
    subscription = errorObservable.subscribe(notifyLog)
    clock = mockClock()
  })

  afterEach(() => {
    subscription.unsubscribe()
    clock.cleanup()
    reportingObserverStub.reset()
    resetExperimentalFeatures()
  })

  it('should report when ff forward-reports enabled', () => {
    updateExperimentalFeatures(['forward-reports'])

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

  it('should not report when ff forward-reports disabled', () => {
    trackReportError(errorObservable)

    reportingObserverStub.raiseReport('intervention')

    expect(notifyLog).not.toHaveBeenCalled()
  })
})
