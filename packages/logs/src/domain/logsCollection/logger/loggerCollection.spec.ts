import type { TimeStamp } from '@datadog/browser-core'
import { ConsoleApiName, timeStampNow, display, ErrorSource } from '@datadog/browser-core'
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

  describe('when handle type is set to "console"', () => {
    beforeEach(() => {
      logger.setHandler(HandlerType.console)
      spyOn(display, 'debug')
      spyOn(display, 'info')
      spyOn(display, 'warn')
      spyOn(display, 'error')
      spyOn(display, 'log')
    })

    it('should print the log message and context to the console', () => {
      logger.setContext({ 'logger-context': 'foo' })

      handleLog(
        { message: 'message', status: StatusType.error, context: { 'log-context': 'bar' } },
        logger,
        COMMON_CONTEXT
      )

      expect(display.error).toHaveBeenCalledOnceWith('message', {
        'logger-context': 'foo',
        'log-context': 'bar',
      })
      expect(rawLogsEvents.length).toEqual(1)
    })

    for (const { status, api } of [
      { status: StatusType.debug, api: ConsoleApiName.debug },
      { status: StatusType.info, api: ConsoleApiName.info },
      { status: StatusType.warn, api: ConsoleApiName.warn },
      { status: StatusType.error, api: ConsoleApiName.error },
    ]) {
      it(`should use display.${api} to log messages with status ${status}`, () => {
        handleLog({ message: 'message', status }, logger, COMMON_CONTEXT)

        expect(display[api]).toHaveBeenCalled()
      })
    }

    it('does not print the log if its status is below the logger level', () => {
      logger.setLevel(StatusType.warn)
      handleLog({ message: 'message', status: StatusType.info }, logger, COMMON_CONTEXT)

      expect(display.info).not.toHaveBeenCalled()
    })

    it('does not print the log and does not crash if its status is unknown', () => {
      handleLog({ message: 'message', status: 'unknown' as StatusType }, logger, COMMON_CONTEXT)

      expect(display.info).not.toHaveBeenCalled()
      expect(display.log).not.toHaveBeenCalled()
      expect(display.error).not.toHaveBeenCalled()
      expect(display.warn).not.toHaveBeenCalled()
      expect(display.debug).not.toHaveBeenCalled()
    })
  })
})
