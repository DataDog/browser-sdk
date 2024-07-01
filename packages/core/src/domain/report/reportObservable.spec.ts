import type { MockCspEventListener, MockReportingObserver } from '../../../test'
import { mockReportingObserver, mockCspEventListener, FAKE_CSP_VIOLATION_EVENT } from '../../../test'
import type { Subscription } from '../../tools/observable'
import type { Configuration } from '../configuration'
import { initReportObservable, RawReportType } from './reportObservable'

describe('report observable', () => {
  let reportingObserver: MockReportingObserver
  let cspEventListener: MockCspEventListener
  let consoleSubscription: Subscription
  let notifyReport: jasmine.Spy
  let configuration: Configuration

  beforeEach(() => {
    configuration = {} as Configuration
    reportingObserver = mockReportingObserver()
    cspEventListener = mockCspEventListener()
    notifyReport = jasmine.createSpy('notifyReport')
  })

  afterEach(() => {
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
          subtype: 'NavigatorVibrate',
          type,
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
      message: "csp_violation: 'blob' blocked by 'worker-src' directive",
      type: 'csp_violation',
      subtype: 'worker-src',
      originalReport: FAKE_CSP_VIOLATION_EVENT,
      stack: `worker-src: 'blob' blocked by 'worker-src' directive of the policy "worker-src 'none'"
  at <anonymous> @ http://foo.bar/index.js:17:8`,
    })
  })
})
