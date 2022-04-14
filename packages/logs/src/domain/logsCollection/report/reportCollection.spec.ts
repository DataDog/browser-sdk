import { ErrorSource, noop, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import { stubReportingObserver } from '@datadog/browser-core/test/stubReportApis'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import type { RawLogCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'
import { startReportCollection } from './reportCollection'

describe('reports', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let reportingObserverStub: ReturnType<typeof stubReportingObserver>
  let stopReportCollection: () => void
  let lifeCycle: LifeCycle
  let rawLogs: RawLogCollectedData[]

  beforeEach(() => {
    rawLogs = []
    stopReportCollection = noop
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLog) => rawLogs.push(rawLog))
    reportingObserverStub = stubReportingObserver()
  })

  afterEach(() => {
    reportingObserverStub.reset()
    resetExperimentalFeatures()
    stopReportCollection()
  })

  it('should send reports when ff forward-reports is enabled', () => {
    updateExperimentalFeatures(['forward-reports'])
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      lifeCycle
    ))

    reportingObserverStub.raiseReport('intervention')
    expect(rawLogs[0].rawLog).toEqual({
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

  it('should not send reports when ff forward-reports is disabled', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      lifeCycle
    ))
    reportingObserverStub.raiseReport('intervention')

    expect(rawLogs.length).toEqual(0)
  })

  it('should not send reports when forwardReports init option not specified', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration })!,
      lifeCycle
    ))
    reportingObserverStub.raiseReport('intervention')

    expect(rawLogs.length).toEqual(0)
  })

  it('should add the source file information to the message for non error reports', () => {
    updateExperimentalFeatures(['forward-reports'])
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['deprecation'] })!,
      lifeCycle
    ))

    reportingObserverStub.raiseReport('deprecation')

    expect(rawLogs[0].rawLog).toEqual({
      message: 'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
      status: StatusType.warn,
      origin: ErrorSource.REPORT,
      error: undefined,
    })
  })
})
