import type { RawError, Subscription } from '@openobserve/browser-core'
import { clocksNow } from '@openobserve/js-core/time'
import { ErrorHandling, ErrorSource, Observable } from '@openobserve/browser-core'
import type { MockCspEventListener, MockReportingObserver } from '@openobserve/browser-core/test'
import {
  FAKE_CSP_VIOLATION_EVENT,
  FAKE_REPORT,
  mockClock,
  mockCspEventListener,
  mockReportingObserver,
  registerCleanupTask,
} from '@openobserve/browser-core/test'
import { trackReportError } from './trackReportError'

describe('trackReportError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: jasmine.Spy
  let reportingObserver: MockReportingObserver
  let cspEventListener: MockCspEventListener

  beforeEach(() => {
    if (!window.ReportingObserver) {
      pending('ReportingObserver not supported')
    }
    errorObservable = new Observable()
    notifyLog = jasmine.createSpy('notifyLog')
    reportingObserver = mockReportingObserver()
    subscription = errorObservable.subscribe(notifyLog)
    mockClock()
    registerCleanupTask(() => {
      subscription.unsubscribe()
    })
    cspEventListener = mockCspEventListener()
  })

  it('should track reports', () => {
    trackReportError(errorObservable)
    reportingObserver.raiseReport('intervention')

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: jasmine.any(String),
      stack: jasmine.any(String),
      source: ErrorSource.REPORT,
      handling: ErrorHandling.UNHANDLED,
      type: 'NavigatorVibrate',
      originalError: FAKE_REPORT,
    })
  })

  it('should track securitypolicyviolation', () => {
    trackReportError(errorObservable)
    cspEventListener.dispatchEvent()

    expect(notifyLog).toHaveBeenCalledWith({
      startClocks: clocksNow(),
      message: jasmine.any(String),
      stack: jasmine.any(String),
      source: ErrorSource.REPORT,
      handling: ErrorHandling.UNHANDLED,
      type: FAKE_CSP_VIOLATION_EVENT.effectiveDirective,
      originalError: FAKE_CSP_VIOLATION_EVENT,
      csp: {
        disposition: FAKE_CSP_VIOLATION_EVENT.disposition,
      },
    })
  })
})
