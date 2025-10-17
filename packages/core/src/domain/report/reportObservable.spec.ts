import { vi } from 'vitest'
import type { MockCspEventListener, MockReportingObserver } from '../../../test'
import { mockReportingObserver, mockCspEventListener, FAKE_CSP_VIOLATION_EVENT } from '../../../test'
import type { Subscription } from '../../tools/observable'
import type { Configuration } from '../configuration'
import { ErrorHandling, ErrorSource } from '../error/error.types'
import type { RawReportError } from './reportObservable'
import { initReportObservable, RawReportType } from './reportObservable'

describe('report observable', () => {
  let reportingObserver: MockReportingObserver
  let cspEventListener: MockCspEventListener
  let consoleSubscription: Subscription
  let notifyReport: ReturnType<typeof vi.fn<(reportError: RawReportError) =>> void>
  let configuration: Configuration

  beforeEach(() => {
    if (!window.ReportingObserver) {
      pending('ReportingObserver not supported')
    }
    configuration = {} as Configuration
    reportingObserver = mockReportingObserver()
    cspEventListener = mockCspEventListener()
    notifyReport = vi.fn()
  })

  afterEach(() => {
    consoleSubscription?.unsubscribe()
  })
  ;[RawReportType.deprecation, RawReportType.intervention].forEach((type) => {
    it(`should notify ${type} reports`, () => {
      consoleSubscription = initReportObservable(configuration, [type]).subscribe(notifyReport)
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
    consoleSubscription = initReportObservable(configuration, [RawReportType.intervention]).subscribe(notifyReport)
    reportingObserver.raiseReport(RawReportType.intervention)

    const [report] = notifyReport.mock.calls[notifyReport.mock.calls.length - 1]

    expect(report.stack).toEqual(`NavigatorVibrate: foo bar
  at <anonymous> @ http://foo.bar/index.js:20:10`)
  })

  it(`should notify ${RawReportType.cspViolation}`, () => {
    consoleSubscription = initReportObservable(configuration, [RawReportType.cspViolation]).subscribe(notifyReport)
    cspEventListener.dispatchEvent()

    expect(notifyReport).toHaveBeenCalledOnceWith({
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
})
