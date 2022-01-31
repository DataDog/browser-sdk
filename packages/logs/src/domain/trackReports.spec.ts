import { isChromium } from '@datadog/browser-core'
import { FAKE_REPORT, stubReportingObserver } from '../test/stubReportingObserver'
import { FAKE_CSP_VIOLATION_EVENT, stubCspEventListener } from '../test/stubCspEventListener'
import { trackCspViolation, trackReports } from './trackReports'

describe('track reports', () => {
  let reportingObserverStub: { reset(): void; raiseReport(): void }
  let cspEventListenerStub: { reset(): void; dispatchEvent(): void }

  beforeEach(() => {
    if (!isChromium()) {
      pending('no ReportingObserver support')
    }

    reportingObserverStub = stubReportingObserver()
    cspEventListenerStub = stubCspEventListener()
  })

  it('should track reports', () => {
    const callbackSpy = jasmine.createSpy()
    trackReports(['intervention'], callbackSpy)
    reportingObserverStub.raiseReport()

    expect(callbackSpy).toHaveBeenCalled()
    const [message, report] = callbackSpy.calls.mostRecent().args
    expect(message).toContain('intervention')
    expect(report).toEqual(FAKE_REPORT)
  })

  it('should track csp violation', () => {
    const callbackSpy = jasmine.createSpy()
    trackCspViolation(callbackSpy)
    cspEventListenerStub.dispatchEvent()

    expect(callbackSpy).toHaveBeenCalled()
    const [message, report] = callbackSpy.calls.mostRecent().args
    expect(message).toContain('csp violation')
    expect(report).toEqual(FAKE_CSP_VIOLATION_EVENT)
  })

  afterEach(() => {
    reportingObserverStub.reset()
    cspEventListenerStub.reset()
  })
})
