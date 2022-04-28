import type { TimeStamp } from '@datadog/browser-core'
import { timeStampNow, display, ErrorSource } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test/specHelper'
import { mockClock } from '@datadog/browser-core/test/specHelper'
import type { CommonContext, RawLoggerLogsEvent } from '../../../rawLogsEvent.types'
import type { RawLogsEventCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { HandlerType, Logger, StatusType } from '../../logger'
import { startLoggerCollection } from './loggerCollection'

const COMMON_CONTEXT = {} as CommonContext
const FAKE_DATE = 1234 as TimeStamp

describe('logger collection', () => {
  let consoleLogSpy: jasmine.Spy
  let lifeCycle: LifeCycle
  let handleLog: ReturnType<typeof startLoggerCollection>['handleLog']
  let logger: Logger
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawLoggerLogsEvent>>
  let clock: Clock

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawLoggerLogsEvent>)
    )
    consoleLogSpy = spyOn(display, 'log').and.callFake(() => true)
    spyOn(console, 'error').and.callFake(() => true)
    logger = new Logger((...params) => handleLog(...params))
    ;({ handleLog: handleLog } = startLoggerCollection(lifeCycle))
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('should send logger logs', () => {
    handleLog({ message: 'message', status: StatusType.error }, logger, COMMON_CONTEXT)

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      date: timeStampNow(),
      origin: ErrorSource.LOGGER,
      message: 'message',
      status: StatusType.error,
    })
  })

  it('should send the saved date when present', () => {
    handleLog({ message: 'message', status: StatusType.error }, logger, COMMON_CONTEXT, FAKE_DATE)

    expect(rawLogsEvents[0].rawLogsEvent.date).toEqual(FAKE_DATE)
  })

  it('should print the log to the console when handler type is set to "console"', () => {
    logger.setHandler(HandlerType.console)

    handleLog({ message: 'message', status: StatusType.error }, logger, COMMON_CONTEXT)

    expect(consoleLogSpy).toHaveBeenCalled()
    expect(rawLogsEvents.length).toEqual(1)
  })
})
