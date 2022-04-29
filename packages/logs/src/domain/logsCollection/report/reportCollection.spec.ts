import { ErrorSource, noop } from '@datadog/browser-core'
import { stubReportingObserver } from '@datadog/browser-core/test/stubReportApis'
import type { RawReportLogsEvent } from '../../../rawLogsEvent.types'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import type { RawLogsEventCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'
import { startReportCollection } from './reportCollection'

describe('reports', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let reportingObserverStub: ReturnType<typeof stubReportingObserver>
  let stopReportCollection: () => void
  let lifeCycle: LifeCycle
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawReportLogsEvent>>

  beforeEach(() => {
    rawLogsEvents = []
    stopReportCollection = noop
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawReportLogsEvent>)
    )
    reportingObserverStub = stubReportingObserver()
  })

  afterEach(() => {
    reportingObserverStub.reset()
    stopReportCollection()
  })

  it('should send reports', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      lifeCycle
    ))

    reportingObserverStub.raiseReport('intervention')
    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      error: {
        kind: 'NavigatorVibrate',
        origin: ErrorSource.REPORT,
        stack: jasmine.any(String),
      },
      date: jasmine.any(Number),
      message: 'intervention: foo bar',
      status: StatusType.error,
      origin: ErrorSource.REPORT,
    })
  })

  it('should not send reports when forwardReports init option not specified', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration })!,
      lifeCycle
    ))
    reportingObserverStub.raiseReport('intervention')

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should add the source file information to the message for non error reports', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['deprecation'] })!,
      lifeCycle
    ))

    reportingObserverStub.raiseReport('deprecation')

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      date: jasmine.any(Number),
      message: 'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
      status: StatusType.warn,
      origin: ErrorSource.REPORT,
      error: undefined,
    })
  })
})
