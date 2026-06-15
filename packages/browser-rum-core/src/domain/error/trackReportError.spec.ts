import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { RawError, Subscription } from '@datadog/browser-core'
import { clocksNow } from '@datadog/js-core/time'
import { ErrorHandling, ErrorSource, Observable } from '@datadog/browser-core'
import type { MockCspEventListener, MockReportingObserver } from '@datadog/browser-core/test'
import {
  FAKE_CSP_VIOLATION_EVENT,
  FAKE_REPORT,
  mockClock,
  mockCspEventListener,
  mockReportingObserver,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { trackReportError } from './trackReportError'

describe('trackReportError', () => {
  let errorObservable: Observable<RawError>
  let subscription: Subscription
  let notifyLog: Mock
  let reportingObserver: MockReportingObserver
  let cspEventListener: MockCspEventListener

  beforeEach((ctx) => {
    if (!window.ReportingObserver) {
      ctx.skip(true, 'ReportingObserver not supported')
      return
    }
    errorObservable = new Observable()
    notifyLog = vi.fn()
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
      message: expect.any(String),
      stack: expect.any(String),
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
      message: expect.any(String),
      stack: expect.any(String),
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
