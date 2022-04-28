import { ErrorSource, noop } from '@datadog/browser-core'
import { stubReportingObserver } from '@datadog/browser-core/test/stubReportApis'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import { StatusType } from '../../logger'
import { createSender } from '../../sender'
import { startReportCollection } from './reportCollection'

describe('reports', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let sendLogSpy: jasmine.Spy
  let reportingObserverStub: ReturnType<typeof stubReportingObserver>
  let stopReportCollection: () => void

  beforeEach(() => {
    stopReportCollection = noop
    sendLogSpy = jasmine.createSpy('sendLogSpy')
    reportingObserverStub = stubReportingObserver()
  })

  afterEach(() => {
    reportingObserverStub.reset()
    stopReportCollection()
  })

  it('should send reports', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      createSender(sendLogSpy)
    ))

    reportingObserverStub.raiseReport('intervention')
    expect(sendLogSpy).toHaveBeenCalledOnceWith({
      error: {
        kind: 'NavigatorVibrate',
        origin: ErrorSource.REPORT,
        stack: jasmine.any(String),
      },
      message: 'intervention: foo bar',
      status: StatusType.error,
      origin: ErrorSource.REPORT,
    })
  })

  it('should not send reports when forwardReports init option not specified', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration })!,
      createSender(sendLogSpy)
    ))
    reportingObserverStub.raiseReport('intervention')

    expect(sendLogSpy).not.toHaveBeenCalled()
  })

  it('should add the source file information to the message for non error reports', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['deprecation'] })!,
      createSender(sendLogSpy)
    ))

    reportingObserverStub.raiseReport('deprecation')

    expect(sendLogSpy).toHaveBeenCalledOnceWith({
      message: 'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
      status: StatusType.warn,
      origin: ErrorSource.REPORT,
    })
  })
})
