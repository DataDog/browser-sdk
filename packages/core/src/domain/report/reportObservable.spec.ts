import type { Subscription } from '../../tools/observable'
import { stubReportingObserver, stubCspEventListener } from '../../../test/stubReportApis'
import { initReportObservable, CustomReportType } from './reportObservable'

describe(`report observable`, () => {
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
  ;[CustomReportType.deprecation, CustomReportType.intervention].forEach((type) => {
    it(`should notify ${type} reports`, () => {
      consoleSubscription = initReportObservable([type]).subscribe(notifyReport)
      reportingObserverStub.raiseReport(type)

      const [report] = notifyReport.calls.mostRecent().args

      expect(report).toEqual(
        jasmine.objectContaining({
          message: `${type}: foo bar`,
          type,
        })
      )
    })
  })

  it(`should compute stack for ${CustomReportType.intervention}`, () => {
    consoleSubscription = initReportObservable([CustomReportType.intervention]).subscribe(notifyReport)
    reportingObserverStub.raiseReport(CustomReportType.intervention)

    const [report] = notifyReport.calls.mostRecent().args

    expect(report.stack).toEqual(`NavigatorVibrate: foo bar
at <anonymous> @ http://foo.bar/index.js:20:10`)
  })

  it(`should notify ${CustomReportType.cspViolation}`, () => {
    consoleSubscription = initReportObservable([CustomReportType.cspViolation]).subscribe(notifyReport)
    cspEventListenerStub.dispatchEvent()

    expect(notifyReport).toHaveBeenCalledOnceWith({
      message: `csp_violation: 'blob' blocked by 'worker-src' directive`,
      type: 'csp_violation',
      stack: `csp_violation: 'blob' blocked by 'worker-src' directive
at <anonymous> @ http://foo.bar/index.js:17:8`,
    })
  })
})
