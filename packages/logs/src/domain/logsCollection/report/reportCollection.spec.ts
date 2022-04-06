import { ErrorSource, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import { stubReportingObserver } from '@datadog/browser-core/test/stubReportApis'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import { StatusType } from '../../logger'
import { createSender } from '../../sender'
import { startReportCollection } from './reportCollection'

describe('reports', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let sendLogSpy: jasmine.Spy
  let reportingObserverStub: ReturnType<typeof stubReportingObserver>

  beforeEach(() => {
    sendLogSpy = jasmine.createSpy('sendLogSpy')
    reportingObserverStub = stubReportingObserver()
  })

  afterEach(() => {
    reportingObserverStub.reset()
  })

  it('should send reports when ff forward-reports is enabled', () => {
    updateExperimentalFeatures(['forward-reports'])
    const { stop } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      createSender(sendLogSpy)
    )

    reportingObserverStub.raiseReport('intervention')
    expect(sendLogSpy).toHaveBeenCalledOnceWith({
      error: {
        kind: 'NavigatorVibrate',
        origin: ErrorSource.REPORT,
        stack: jasmine.any(String),
      },
      message: 'intervention: foo bar',
      status: StatusType.error,
    })

    resetExperimentalFeatures()
    stop()
  })

  it('should not send reports when ff forward-reports is disabled', () => {
    const { stop } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      createSender(sendLogSpy)
    )
    reportingObserverStub.raiseReport('intervention')

    expect(sendLogSpy).not.toHaveBeenCalled()
    stop()
  })

  it('should not send reports when forwardReports init option not specified', () => {
    const { stop } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration })!,
      createSender(sendLogSpy)
    )
    reportingObserverStub.raiseReport('intervention')

    expect(sendLogSpy).not.toHaveBeenCalled()
    stop()
  })

  it('should add the source file information to the message for non error reports', () => {
    updateExperimentalFeatures(['forward-reports'])
    const { stop } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['deprecation'] })!,
      createSender(sendLogSpy)
    )

    reportingObserverStub.raiseReport('deprecation')

    expect(sendLogSpy).toHaveBeenCalledOnceWith({
      message: 'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
      status: StatusType.warn,
    })

    resetExperimentalFeatures()
    stop()
  })
})
