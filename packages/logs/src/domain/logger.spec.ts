import type { LogsMessage } from './logger'
import { HandlerType, Logger, STATUSES, StatusType } from './logger'

describe('Logger', () => {
  let logger: Logger
  let handleLogSpy: jasmine.Spy<(message: LogsMessage, logger: Logger) => void>

  function getLoggedMessage(index: number) {
    return handleLogSpy.calls.argsFor(index)[0]
  }

  function getMessageLogger(index: number) {
    return handleLogSpy.calls.argsFor(index)[1]
  }

  beforeEach(() => {
    handleLogSpy = jasmine.createSpy()
    logger = new Logger(handleLogSpy)
  })

  describe('log methods', () => {
    it("'logger.log' should have info status by default", () => {
      logger.log('message')

      expect(getLoggedMessage(0).status).toEqual(StatusType.info)
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        logger[status]('message')
        expect(getLoggedMessage(0).status).toEqual(status)
      })
    })

    it("'logger.log' should send the log message", () => {
      logger.log('message', { foo: 'bar' }, StatusType.info)

      expect(getLoggedMessage(0)).toEqual({
        message: 'message',
        context: { foo: 'bar' },
        status: StatusType.info,
      })
    })

    it("'logger.log' should send the logger", () => {
      logger.log('message')

      expect(getMessageLogger(0)).toBe(logger)
    })
  })

  describe('contexts', () => {
    it('logger context should be deep copied', () => {
      const loggerContext = { foo: 'bar' }
      logger = new Logger(handleLogSpy, undefined, HandlerType.http, StatusType.debug, loggerContext)
      loggerContext.foo = 'baz'

      expect(logger.getContext()).toEqual({ foo: 'bar' })
    })

    it('message context should be deep copied', () => {
      const messageContext = { foo: 'bar' }
      logger.log('message', messageContext)
      messageContext.foo = 'baz'

      expect(getLoggedMessage(0).context).toEqual({ foo: 'bar' })
    })
  })

  describe('level', () => {
    it('should be debug by default', () => {
      expect(logger.getLevel()).toEqual(StatusType.debug)
    })

    it('should be configurable', () => {
      logger.setLevel(StatusType.info)

      expect(logger.getLevel()).toEqual(StatusType.info)
    })
  })

  describe('handler type', () => {
    it('should be "http" by default', () => {
      logger.debug('message')

      expect(logger.getHandler()).toEqual(HandlerType.http)
    })

    it('should be configurable to "console"', () => {
      logger.setHandler(HandlerType.console)

      expect(logger.getHandler()).toEqual(HandlerType.console)
    })

    it('should be configurable to "silent"', () => {
      logger.setHandler(HandlerType.silent)

      expect(logger.getHandler()).toEqual(HandlerType.silent)
    })

    it('should be configurable with multiple handlers', () => {
      logger.setHandler([HandlerType.console, HandlerType.http])

      expect(logger.getHandler()).toEqual([HandlerType.console, HandlerType.http])
    })
  })
})
