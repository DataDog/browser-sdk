import { isChromium } from '@datadog/browser-core'
import { FAKE_REPORT, stubReportingObserver } from '../test/stubReportingObserver'
import { trackReports } from './trackReports'

describe('track reports', () => {
  let reportingObserverStub: { reset(): void; raiseReport(): void }

  beforeEach(() => {
    if (!isChromium()) {
      pending('no ReportingObserver support')
    }

    reportingObserverStub = stubReportingObserver()
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

  afterEach(() => {
    reportingObserverStub.reset()
  })
})
