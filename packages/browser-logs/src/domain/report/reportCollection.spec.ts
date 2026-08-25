import { ErrorHandling, ErrorSource, noop } from '@datadog/browser-core'
import type { MockReportingObserver } from '@datadog/browser-core/test'
import { mockReportingObserver, mockSourceCodeContext } from '@datadog/browser-core/test'
import type { RawReportLogsEvent } from '../../rawLogsEvent.types'
import { validateAndBuildLogsConfiguration } from '../configuration'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'
import { startReportCollection } from './reportCollection'

describe('reports', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let reportingObserver: MockReportingObserver
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
    reportingObserver = mockReportingObserver()
  })

  afterEach(() => {
    stopReportCollection()
  })

  it('should send reports', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      lifeCycle
    ))

    reportingObserver.raiseReport('intervention')
    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      error: {
        kind: 'NavigatorVibrate',
        stack: jasmine.any(String),
        handling: ErrorHandling.UNHANDLED,
        causes: undefined,
        fingerprint: undefined,
        message: undefined,
      },
      date: jasmine.any(Number),
      message: 'intervention: foo bar',
      status: StatusType.error,
      origin: ErrorSource.REPORT,
      _dd: { debug_ids: undefined },
    })
  })

  it('should attach debug_ids resolved from the report source file', () => {
    const debugId = '01234567-89ab-cdef-0123-456789abcdef'
    mockSourceCodeContext({ 'Error: foo\n    at foo (http://foo.bar/index.js:52:15)': { ddDebugId: debugId } })
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
      lifeCycle
    ))

    reportingObserver.raiseReport('intervention')

    expect(rawLogsEvents[0].rawLogsEvent._dd).toEqual({
      debug_ids: [{ url: 'http://foo.bar/index.js', id: debugId }],
    })
  })

  it('should not send reports when forwardReports init option not specified', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration })!,
      lifeCycle
    ))
    reportingObserver.raiseReport('intervention')

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should add the source file information to the message for non error reports', () => {
    ;({ stop: stopReportCollection } = startReportCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['deprecation'] })!,
      lifeCycle
    ))

    reportingObserver.raiseReport('deprecation')

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      date: jasmine.any(Number),
      message: 'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
      status: StatusType.warn,
      origin: ErrorSource.REPORT,
      error: undefined,
      _dd: { debug_ids: undefined },
    })
  })
})
