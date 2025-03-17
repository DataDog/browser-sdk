import type { TimeStamp } from '@flashcatcloud/browser-core'
import {
  ConsoleApiName,
  timeStampNow,
  ErrorSource,
  originalConsoleMethods,
  createCustomerDataTracker,
  noop,
} from '@flashcatcloud/browser-core'
import type { Clock } from '@flashcatcloud/browser-core/test'
import { mockClock } from '@flashcatcloud/browser-core/test'
import type { CommonContext, RawLoggerLogsEvent } from '../../rawLogsEvent.types'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { HandlerType, Logger } from '../logger'
import { StatusType } from './isAuthorized'
import { startLoggerCollection } from './loggerCollection'

const HANDLING_STACK = 'handlingStack'
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
    logger = new Logger((...params) => handleLog(...params), createCustomerDataTracker(noop))
    ;({ handleLog: handleLog } = startLoggerCollection(lifeCycle))
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  describe('when handle type is set to "console"', () => {
    beforeEach(() => {
      logger.setHandler(HandlerType.console)
      spyOn(originalConsoleMethods, 'debug')
      spyOn(originalConsoleMethods, 'info')
      spyOn(originalConsoleMethods, 'warn')
      spyOn(originalConsoleMethods, 'error')
      spyOn(originalConsoleMethods, 'log')
    })

    it('should print the log message and context to the console', () => {
      logger.setContext({ foo: 'from-logger', bar: 'from-logger' })

      handleLog(
        { message: 'message', status: StatusType.error, context: { bar: 'from-message' } },
        logger,
        HANDLING_STACK,
        COMMON_CONTEXT
      )

      expect(originalConsoleMethods.error).toHaveBeenCalledOnceWith('message', {
        foo: 'from-logger',
        bar: 'from-message',
      })
    })

    for (const { status, api } of [
      { status: StatusType.ok, api: ConsoleApiName.debug },
      { status: StatusType.debug, api: ConsoleApiName.debug },
      { status: StatusType.info, api: ConsoleApiName.info },
      { status: StatusType.notice, api: ConsoleApiName.info },
      { status: StatusType.warn, api: ConsoleApiName.warn },
      { status: StatusType.error, api: ConsoleApiName.error },
      { status: StatusType.critical, api: ConsoleApiName.error },
      { status: StatusType.alert, api: ConsoleApiName.error },
      { status: StatusType.emerg, api: ConsoleApiName.error },
    ]) {
      it(`should use console.${api} to log messages with status ${status}`, () => {
        logger.setLevel(StatusType.ok)
        handleLog({ message: 'message', status }, logger, HANDLING_STACK, COMMON_CONTEXT)

        expect(originalConsoleMethods[api]).toHaveBeenCalled()
      })
    }

    it('does not print the log if its status is below the logger level', () => {
      logger.setLevel(StatusType.warn)
      handleLog({ message: 'message', status: StatusType.info }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(originalConsoleMethods.info).not.toHaveBeenCalled()
    })

    it('does not print the log and does not crash if its status is unknown', () => {
      handleLog({ message: 'message', status: 'unknown' as StatusType }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(originalConsoleMethods.info).not.toHaveBeenCalled()
      expect(originalConsoleMethods.log).not.toHaveBeenCalled()
      expect(originalConsoleMethods.error).not.toHaveBeenCalled()
      expect(originalConsoleMethods.warn).not.toHaveBeenCalled()
      expect(originalConsoleMethods.debug).not.toHaveBeenCalled()
    })
  })

  describe('when handle type is set to "http"', () => {
    beforeEach(() => {
      logger.setHandler(HandlerType.http)
    })

    it('should send the log message and context', () => {
      logger.setContext({ foo: 'from-logger', bar: 'from-logger' })

      handleLog(
        { message: 'message', status: StatusType.error, context: { bar: 'from-message' } },
        logger,
        HANDLING_STACK,
        COMMON_CONTEXT
      )

      expect(rawLogsEvents[0]).toEqual({
        rawLogsEvent: {
          date: timeStampNow(),
          origin: ErrorSource.LOGGER,
          message: 'message',
          status: StatusType.error,
        },
        messageContext: {
          foo: 'from-logger',
          bar: 'from-message',
        },
        savedCommonContext: COMMON_CONTEXT,
        domainContext: {
          handlingStack: HANDLING_STACK,
        },
      })
    })

    it('should send the saved date when present', () => {
      handleLog({ message: 'message', status: StatusType.error }, logger, HANDLING_STACK, COMMON_CONTEXT, FAKE_DATE)

      expect(rawLogsEvents[0].rawLogsEvent.date).toEqual(FAKE_DATE)
    })

    it('does not send the log if its status is below the logger level', () => {
      logger.setLevel(StatusType.warn)
      handleLog({ message: 'message', status: StatusType.info }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(rawLogsEvents.length).toBe(0)
    })

    it('does not send the log and does not crash if its status is unknown', () => {
      handleLog({ message: 'message', status: 'unknown' as StatusType }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(rawLogsEvents.length).toBe(0)
    })
  })
})
