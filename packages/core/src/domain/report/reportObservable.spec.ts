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
  let notifyReport: jasmine.Spy<(reportError: RawReportError) => void>
  let configuration: Configuration

  beforeEach(() => {
    configuration = {} as Configuration
    reportingObserver = mockReportingObserver()
    cspEventListener = mockCspEventListener()
    notifyReport = jasmine.createSpy('notifyReport')
  })

  afterEach(() => {
    reportingObserver.reset()
    consoleSubscription.unsubscribe()
  })
  ;[RawReportType.deprecation, RawReportType.intervention].forEach((type) => {
    it(`should notify ${type} reports`, () => {
      consoleSubscription = initReportObservable(configuration, [type]).subscribe(notifyReport)
      reportingObserver.raiseReport(type)

      const [report] = notifyReport.calls.mostRecent().args

      expect(report).toEqual(
        jasmine.objectContaining({
          message: `${type}: foo bar`,
          type: 'NavigatorVibrate',
        })
      )
    })
  })

  it(`should compute stack for ${RawReportType.intervention}`, () => {
    consoleSubscription = initReportObservable(configuration, [RawReportType.intervention]).subscribe(notifyReport)
    reportingObserver.raiseReport(RawReportType.intervention)

    const [report] = notifyReport.calls.mostRecent().args

    expect(report.stack).toEqual(`NavigatorVibrate: foo bar
  at <anonymous> @ http://foo.bar/index.js:20:10`)
  })

  it(`should notify ${RawReportType.cspViolation}`, () => {
    consoleSubscription = initReportObservable(configuration, [RawReportType.cspViolation]).subscribe(notifyReport)
    cspEventListener.dispatchEvent()

    expect(notifyReport).toHaveBeenCalledOnceWith({
      startClocks: jasmine.any(Object),
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
