import { vi, afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { MockCspEventListener, MockReportingObserver } from '../../../test'
import { mockReportingObserver, mockCspEventListener, FAKE_CSP_VIOLATION_EVENT } from '../../../test'
import type { Subscription } from '../../tools/observable'
import { ErrorHandling, ErrorSource } from '../error/error.types'
import type { RawReportError } from './reportObservable'
import { initReportObservable, RawReportType } from './reportObservable'

describe('report observable', () => {
  let reportingObserver: MockReportingObserver
  let cspEventListener: MockCspEventListener
  let consoleSubscription: Subscription
  let notifyReport: Mock<(reportError: RawReportError) => void>

  beforeEach((ctx) => {
    if (!window.ReportingObserver) {
      ctx.skip(true, 'ReportingObserver not supported')
    }
    reportingObserver = mockReportingObserver()
    cspEventListener = mockCspEventListener()
    notifyReport = vi.fn()
  })

  afterEach(() => {
    consoleSubscription?.unsubscribe()
  })
  ;[RawReportType.deprecation, RawReportType.intervention].forEach((type) => {
    it(`should notify ${type} reports`, () => {
      consoleSubscription = initReportObservable([type]).subscribe(notifyReport)
      reportingObserver.raiseReport(type)

      const [report] = notifyReport.mock.calls[notifyReport.mock.calls.length - 1]

      expect(report).toEqual(
        expect.objectContaining({
          message: `${type}: foo bar`,
          type: 'NavigatorVibrate',
        })
      )
    })
  })

  it(`should compute stack for ${RawReportType.intervention}`, () => {
    consoleSubscription = initReportObservable([RawReportType.intervention]).subscribe(notifyReport)
    reportingObserver.raiseReport(RawReportType.intervention)

    const [report] = notifyReport.mock.calls[notifyReport.mock.calls.length - 1]

    expect(report.stack).toEqual(`NavigatorVibrate: foo bar
  at <anonymous> @ http://foo.bar/index.js:20:10`)
  })

  it(`should notify ${RawReportType.cspViolation}`, () => {
    consoleSubscription = initReportObservable([RawReportType.cspViolation]).subscribe(notifyReport)
    cspEventListener.dispatchEvent()

    expect(notifyReport).toHaveBeenCalledTimes(1)
    expect(notifyReport).toHaveBeenCalledExactlyOnceWith({
      startClocks: expect.any(Object),
      source: ErrorSource.REPORT,
      message: "csp_violation: 'blob' blocked by 'worker-src' directive",
      type: 'worker-src',
      originalError: FAKE_CSP_VIOLATION_EVENT,
      stack: `worker-src: 'blob' blocked by 'worker-src' directive of the policy "worker-src 'none'"
  at <anonymous> @ http://foo.bar/index.js:17:8`,
      handling: ErrorHandling.UNHANDLED,
      csp: { disposition: 'enforce' },
    })
  })

  it(`should not notify ${RawReportType.cspViolation} when the event is not supported`, () => {
    const addEventListenerSpy = vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(() => {
      throw new Error('unsupported')
    })

    try {
      consoleSubscription = initReportObservable([RawReportType.cspViolation]).subscribe(notifyReport)
    } finally {
      addEventListenerSpy.mockRestore()
    }
    cspEventListener.dispatchEvent()

    expect(notifyReport).not.toHaveBeenCalled()
  })
})
