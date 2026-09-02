import type { TimeStamp } from '@datadog/js-core/time'
import { timeStampNow } from '@datadog/js-core/time'
import { ErrorHandling, ErrorSource } from '@datadog/browser-core'
import { ConsoleApiName, originalConsoleMethods } from '@datadog/js-core/util'
import { mockClock } from '@datadog/browser-core/test'
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

  beforeEach(() => {
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawLoggerLogsEvent>)
    )
    spyOn(console, 'error').and.callFake(() => true)
    logger = new Logger((...params) => handleLog(...params))
    ;({ handleLog: handleLog } = startLoggerCollection(lifeCycle))
    mockClock()
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

    it('does not leak debug ids into the console output', () => {
      handleLog(
        {
          message: 'message',
          status: StatusType.error,
          debugIds: [{ url: 'http://path/to/debug-id.js', id: '01234567-89ab-cdef-0123-456789abcdef' }],
        },
        logger,
        HANDLING_STACK,
        COMMON_CONTEXT
      )

      expect(originalConsoleMethods.error).toHaveBeenCalledOnceWith('message', {})
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
          _dd: { debug_ids: undefined },
        },
        messageContext: {
          foo: 'from-logger',
          bar: 'from-message',
        },
        savedCommonContext: COMMON_CONTEXT,
        domainContext: {
          handlingStack: HANDLING_STACK,
        },
        ddtags: [],
      })
    })

    it('should expose a provided error on the raw event before assembly', () => {
      const error = {
        stack: 'RuntimeError: unreachable\n  at app.wasm:wasm-function[42]:0x10',
        kind: 'RuntimeError',
        message: 'unreachable',
        handling: ErrorHandling.HANDLED,
      }

      handleLog({ message: 'message', status: StatusType.error, error }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(rawLogsEvents[0].rawLogsEvent.error).toEqual(error)
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

    it('attaches debug ids to the raw log event', () => {
      handleLog(
        {
          message: 'message',
          status: StatusType.error,
          debugIds: [{ url: 'http://path/to/debug-id.js', id: '01234567-89ab-cdef-0123-456789abcdef' }],
        },
        logger,
        HANDLING_STACK,
        COMMON_CONTEXT
      )

      expect(rawLogsEvents[0].rawLogsEvent._dd).toEqual({
        debug_ids: [{ url: 'http://path/to/debug-id.js', id: '01234567-89ab-cdef-0123-456789abcdef' }],
      })
    })
  })

  describe('ddtags', () => {
    beforeEach(() => {
      logger.setHandler(HandlerType.http)
    })

    it('should contain the ddtags of the logger', () => {
      logger.addTag('tag1', 'value1')
      handleLog({ message: 'message', status: StatusType.error }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(rawLogsEvents[0].ddtags).toEqual(['tag1:value1'])
    })

    it('should ignore the tags of the message context', () => {
      handleLog(
        { message: 'message', status: StatusType.error, context: { ddtags: ['tag3:value3'] } },
        logger,
        HANDLING_STACK,
        COMMON_CONTEXT
      )

      expect(rawLogsEvents[0].ddtags).toEqual([])
    })

    it('should ignore the tags of the logger context', () => {
      logger.setContext({ ddtags: ['tag1:value1'] })
      handleLog({ message: 'message', status: StatusType.error }, logger, HANDLING_STACK, COMMON_CONTEXT)

      expect(rawLogsEvents[0].ddtags).toEqual([])
    })
  })
})
