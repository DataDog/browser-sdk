import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { RawError } from '@datadog/browser-core'
import type { Subscription } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { ErrorHandling, ErrorSource } from '@datadog/browser-core'
import { Observable } from '@datadog/js-core/util'
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
      ctx.skip('ReportingObserver not supported')
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
      debugIds: undefined,
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
      debugIds: undefined,
    })
  })
})
