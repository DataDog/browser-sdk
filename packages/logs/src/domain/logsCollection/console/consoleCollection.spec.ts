import { ErrorSource, noop } from '@datadog/browser-core'
import type { RawConsoleLogsEvent } from '../../../rawLogsEvent.types'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import type { RawLogsEventCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'
import { startConsoleCollection } from './consoleCollection'

describe('console collection', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let consoleLogSpy: jasmine.Spy
  let stopConsoleCollection: () => void
  let lifeCycle: LifeCycle
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawConsoleLogsEvent>>

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawConsoleLogsEvent>)
    )
    stopConsoleCollection = noop
    consoleLogSpy = spyOn(console, 'log').and.callFake(() => true)
    spyOn(console, 'error').and.callFake(() => true)
  })

  afterEach(() => {
    stopConsoleCollection()
  })

  it('should send console logs', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      date: jasmine.any(Number),
      message: 'foo bar',
      status: StatusType.info,
      origin: ErrorSource.CONSOLE,
      error: undefined,
    })

    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('console error should have an error object defined', () => {
    ;({ stop: stopConsoleCollection } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      lifeCycle
    ))

    /* eslint-disable-next-line no-console */
    console.error('foo', 'bar')

    expect(rawLogsEvents[0].rawLogsEvent.error).toEqual({
      origin: ErrorSource.CONSOLE,
      stack: undefined,
    })
  })
})
