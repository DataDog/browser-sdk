import { display, ErrorSource, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import type { CommonContext } from 'packages/logs/src/rawLogsEvent.types'
import type { RawLogsEventCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { HandlerType, Logger, StatusType } from '../../logger'
import { startLoggerCollection } from './loggerCollection'

const COMMON_CONTEXT = {} as CommonContext

describe('logger collection', () => {
  let consoleLogSpy: jasmine.Spy
  let lifeCycle: LifeCycle
  let handleLog: ReturnType<typeof startLoggerCollection>['handleLog']
  let logger: Logger
  let rawLogsEvents: RawLogsEventCollectedData[]

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) => rawLogsEvents.push(rawLogsEvent))
    consoleLogSpy = spyOn(display, 'log').and.callFake(() => true)
    spyOn(console, 'error').and.callFake(() => true)
    logger = new Logger((...params) => handleLog(...params))
    ;({ handleLog: handleLog } = startLoggerCollection(lifeCycle))
  })

  afterEach(() => {
    resetExperimentalFeatures()
  })

  it('logs a message with "logger" origin when ff forward-logs is enabled', () => {
    updateExperimentalFeatures(['forward-logs'])

    handleLog({ message: 'message', status: StatusType.error }, logger, COMMON_CONTEXT)

    expect(rawLogsEvents[0].rawLogsEvent.origin).toEqual(ErrorSource.LOGGER)
  })

  it('do not logs a message with "logger" origin when ff forward-logs is enabled', () => {
    handleLog({ message: 'message', status: StatusType.error }, logger, COMMON_CONTEXT)

    expect(rawLogsEvents[0].rawLogsEvent.origin).toBeUndefined()
  })

  it('should print the log to the console when handler type is set to "console"', () => {
    updateExperimentalFeatures(['forward-logs'])
    logger.setHandler(HandlerType.console)

    handleLog({ message: 'message', status: StatusType.error }, logger, COMMON_CONTEXT)

    expect(consoleLogSpy).toHaveBeenCalled()
    expect(rawLogsEvents.length).toEqual(1)
  })
})
