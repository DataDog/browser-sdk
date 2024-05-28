import type { ErrorWithCause } from '@datadog/browser-core'
import { NO_ERROR_STACK_PRESENT_MESSAGE, createCustomerDataTracker, noop } from '@datadog/browser-core'
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
    logger = new Logger(handleLogSpy, createCustomerDataTracker(noop))
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

      it(`'logger.${status}' should populate an error context when an Error object is provided`, () => {
        logger[status]('message', {}, SyntaxError('My Error'))

        expect(getLoggedMessage(0).context).toEqual({
          error: {
            kind: 'SyntaxError',
            message: 'My Error',
            stack: jasmine.stringMatching(/^SyntaxError: My Error/),
            causes: undefined,
          },
        })
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

    it("'logger.log' should serialize error parameter value when type is not Error", () => {
      logger.log('message', {}, StatusType.error, 'My Error' as any)

      expect(getLoggedMessage(0)).toEqual({
        message: 'message',
        context: {
          error: {
            kind: undefined,
            message: 'Provided "My Error"',
            stack: NO_ERROR_STACK_PRESENT_MESSAGE,
            causes: undefined,
          },
        },
        status: 'error',
      })
    })

    describe('when using logger.error', () => {
      it("'logger.error' should have an empty context if no Error object is provided", () => {
        logger.error('message')

        expect(getLoggedMessage(0)).toEqual({
          message: 'message',
          status: 'error',
          context: undefined,
        })
      })

      it('should include causes when provided with an error', () => {
        const error = new Error('High level error') as ErrorWithCause
        error.stack = 'Error: High level error'

        const nestedError = new Error('Mid level error') as ErrorWithCause
        nestedError.stack = 'Error: Mid level error'

        const deepNestedError = new TypeError('Low level error') as ErrorWithCause
        deepNestedError.stack = 'TypeError: Low level error'

        nestedError.cause = deepNestedError
        error.cause = nestedError

        logger.log('Logging message', {}, StatusType.error, error)

        expect(getLoggedMessage(0)).toEqual({
          message: 'Logging message',
          status: 'error',
          context: {
            error: {
              stack: 'Error: High level error',
              kind: 'Error',
              message: 'High level error',
              causes: [
                { message: 'Mid level error', source: 'logger', type: 'Error', stack: 'Error: Mid level error' },
                {
                  message: 'Low level error',
                  source: 'logger',
                  type: 'TypeError',
                  stack: 'TypeError: Low level error',
                },
              ],
            },
          },
        })
      })
    })
  })

  describe('context methods', () => {
    beforeEach(() => {
      const loggerContext = { foo: 'bar' }
      logger = new Logger(
        handleLogSpy,
        createCustomerDataTracker(noop),
        undefined,
        HandlerType.http,
        StatusType.debug,
        loggerContext
      )
    })

    it('getContext should return the context', () => {
      expect(logger.getContext()).toEqual({ foo: 'bar' })
    })

    it('setContext should overwrite the whole context', () => {
      logger.setContext({ qux: 'qix' })
      expect(logger.getContext()).toEqual({ qux: 'qix' })
    })

    it('setContextProperty should set a context value', () => {
      logger.setContextProperty('qux', 'qix')
      expect(logger.getContext()).toEqual({ foo: 'bar', qux: 'qix' })
    })

    it('removeContextProperty should remove a context value', () => {
      logger.removeContextProperty('foo')
      expect(logger.getContext()).toEqual({})
    })

    it('clearContext should clear the context', () => {
      logger.clearContext()
      expect(logger.getContext()).toEqual({})
    })
  })

  describe('contexts', () => {
    it('logger context should be deep copied', () => {
      const loggerContext = { foo: 'bar' }
      logger = new Logger(
        handleLogSpy,
        createCustomerDataTracker(noop),
        undefined,
        HandlerType.http,
        StatusType.debug,
        loggerContext
      )
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
