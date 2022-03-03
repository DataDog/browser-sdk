import type { Subscription } from '../../tools/observable'
import { stubReportingObserver, stubCspEventListener } from '../../../test/stubReportApis'
import { initReportObservable, RawReportType } from './reportObservable'

describe('report observable', () => {
  let reportingObserverStub: { reset(): void; raiseReport(type: string): void }
  let cspEventListenerStub: { dispatchEvent(): void }
  let consoleSubscription: Subscription
  let notifyReport: jasmine.Spy

  beforeEach(() => {
    reportingObserverStub = stubReportingObserver()
    cspEventListenerStub = stubCspEventListener()
    notifyReport = jasmine.createSpy('notifyReport')
  })

  afterEach(() => {
    reportingObserverStub.reset()
    consoleSubscription.unsubscribe()
  })
  ;[RawReportType.deprecation, RawReportType.intervention].forEach((type) => {
    it(`should notify ${type} reports`, () => {
      consoleSubscription = initReportObservable([type]).subscribe(notifyReport)
      reportingObserverStub.raiseReport(type)

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
    consoleSubscription = initReportObservable([RawReportType.intervention]).subscribe(notifyReport)
    reportingObserverStub.raiseReport(RawReportType.intervention)

    const [report] = notifyReport.calls.mostRecent().args

    expect(report.stack).toEqual(`NavigatorVibrate: foo bar
  at <anonymous> @ http://foo.bar/index.js:20:10`)
  })

  it(`should notify ${RawReportType.cspViolation}`, () => {
    consoleSubscription = initReportObservable([RawReportType.cspViolation]).subscribe(notifyReport)
    cspEventListenerStub.dispatchEvent()

    expect(notifyReport).toHaveBeenCalledOnceWith({
      message: "csp_violation: 'blob' blocked by 'worker-src' directive",
      type: 'csp_violation',
      subtype: 'worker-src',
      stack: `worker-src: 'blob' blocked by 'worker-src' directive of the policy "worker-src 'none'"
  at <anonymous> @ http://foo.bar/index.js:17:8`,
    })
  })
})
