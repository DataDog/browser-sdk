import type { MockCspEventListener, MockReportingObserver } from '../../../test'
import {
  mockReportingObserver,
  mockCspEventListener,
  FAKE_CSP_VIOLATION_EVENT,
  FAKE_DOCUMENT_POLICY_VIOLATION_REPORT,
} from '../../../test'
import type { Subscription } from '../../tools/observable'
import { ErrorHandling, ErrorSource } from '../error/error.types'
import type { RawReportError } from './reportObservable'
import { initReportObservable, RawReportType } from './reportObservable'

describe('report observable', () => {
  let reportingObserver: MockReportingObserver
  let cspEventListener: MockCspEventListener
  let consoleSubscription: Subscription
  let notifyReport: jasmine.Spy<(reportError: RawReportError) => void>

  beforeEach(() => {
    if (!window.ReportingObserver) {
      pending('ReportingObserver not supported')
    }
    reportingObserver = mockReportingObserver()
    cspEventListener = mockCspEventListener()
    notifyReport = jasmine.createSpy('notifyReport')
  })

  afterEach(() => {
    consoleSubscription?.unsubscribe()
  })
  ;[RawReportType.deprecation, RawReportType.intervention].forEach((type) => {
    it(`should notify ${type} reports`, () => {
      consoleSubscription = initReportObservable([type]).subscribe(notifyReport)
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
    consoleSubscription = initReportObservable([RawReportType.intervention]).subscribe(notifyReport)
    reportingObserver.raiseReport(RawReportType.intervention)

    const [report] = notifyReport.calls.mostRecent().args

    expect(report.stack).toEqual(`NavigatorVibrate: foo bar
  at <anonymous> @ http://foo.bar/index.js:20:10`)
  })

  it(`should notify ${RawReportType.cspViolation}`, () => {
    consoleSubscription = initReportObservable([RawReportType.cspViolation]).subscribe(notifyReport)
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

  it(`should not notify ${RawReportType.cspViolation} when the event is not supported`, () => {
    ;(EventTarget.prototype.addEventListener as jasmine.Spy).and.throwError('unsupported')

    consoleSubscription = initReportObservable([RawReportType.cspViolation]).subscribe(notifyReport)
    cspEventListener.dispatchEvent()

    expect(notifyReport).not.toHaveBeenCalled()
  })

  it(`should notify ${RawReportType.documentPolicyViolation} reports`, () => {
    consoleSubscription = initReportObservable([RawReportType.documentPolicyViolation]).subscribe(notifyReport)
    reportingObserver.raiseReport('document-policy-violation')

    expect(notifyReport).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        message: 'document-policy-violation: Document policy violation: resource compression is required.',
        type: 'network-efficiency-guardrails',
        csp: { disposition: 'report' },
      })
    )
  })

  it(`should compute stack for ${RawReportType.documentPolicyViolation}`, () => {
    consoleSubscription = initReportObservable([RawReportType.documentPolicyViolation]).subscribe(notifyReport)
    reportingObserver.raiseReport('document-policy-violation')

    const [report] = notifyReport.calls.mostRecent().args

    expect(report.stack)
      .toEqual(`network-efficiency-guardrails: Document policy violation: resource compression is required.
  at <anonymous> @ https://foo.bar/large-uncompressed.js`)
  })

  it(`should notify ${RawReportType.documentPolicyViolation} reports regardless of featureId`, () => {
    consoleSubscription = initReportObservable([RawReportType.documentPolicyViolation]).subscribe(notifyReport)
    reportingObserver.raiseReport('document-policy-violation', {
      body: { ...FAKE_DOCUMENT_POLICY_VIOLATION_REPORT.body, featureId: 'some-other-policy' },
    })

    expect(notifyReport).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'some-other-policy',
      })
    )
  })
})
