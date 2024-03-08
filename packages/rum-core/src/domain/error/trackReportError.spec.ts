import type { RawError, Subscription } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, Observable, clocksNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  FAKE_CSP_VIOLATION_EVENT,
  FAKE_REPORT,
  mockClock,
  stubCspEventListener,
  stubReportingObserver,
} from '@datadog/browser-core/test'
import type { RumConfiguration } from '../configuration'
import { trackReportError } from './trackReportError'

describe('trackReportError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: jasmine.Spy
  let clock: Clock
  let reportingObserverStub: { raiseReport(type: string): void; reset(): void }
  let cspEventListenerStub: ReturnType<typeof stubCspEventListener>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    errorObservable = new Observable()
    notifyLog = jasmine.createSpy('notifyLog')
    reportingObserverStub = stubReportingObserver()
    subscription = errorObservable.subscribe(notifyLog)
    cspEventListenerStub = stubCspEventListener()
    clock = mockClock()
  })

  afterEach(() => {
    subscription.unsubscribe()
    clock.cleanup()
    reportingObserverStub.reset()
  })

  it('should track reports', () => {
    trackReportError(configuration, errorObservable)
    reportingObserverStub.raiseReport('intervention')

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
    trackReportError(configuration, errorObservable)
    cspEventListenerStub.dispatchEvent()

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
