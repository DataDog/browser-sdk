import type { ErrorWithCause } from '@datadog/browser-core'
import { ErrorHandling, NO_ERROR_STACK_PRESENT_MESSAGE, createCustomerDataTracker, noop } from '@datadog/browser-core'
import type { LogsMessage } from './logger'
import { HandlerType, Logger, STATUSES } from './logger'
import { StatusType } from './logger/isAuthorized'

describe('Logger', () => {
  let logger: Logger
  let handleLogSpy: jasmine.Spy<(message: LogsMessage, logger: Logger, handlingStack?: string) => void>

  function getLoggedMessage(index: number) {
    return handleLogSpy.calls.argsFor(index)[0]
  }

  function getMessageLogger(index: number) {
    return handleLogSpy.calls.argsFor(index)[1]
  }

  function getLoggedHandlingStack(index: number) {
    return handleLogSpy.calls.argsFor(index)[2]
  }

  beforeEach(() => {
    handleLogSpy = jasmine.createSpy()
    logger = new Logger(handleLogSpy, createCustomerDataTracker(noop))
  })

  describe('log methods', () => {
    beforeEach(() => {
      logger.setLevel(StatusType.ok)
    })

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
            handling: ErrorHandling.HANDLED,
            fingerprint: undefined,
          },
        })
      })

      it(`'logger.${status}' should create an handling stack`, () => {
        logger[status]('message')

        expect(getLoggedHandlingStack(0)).toBeDefined()
      })

      it(`'logger.${status}' should not create an handling stack if the handler is 'console'`, () => {
        logger.setHandler(HandlerType.console)
        logger[status]('message')

        expect(getLoggedHandlingStack(0)).not.toBeDefined()
      })

      it(`'logger.${status}' should not create an handling stack if the handler is 'silent'`, () => {
        logger.setHandler(HandlerType.silent)
        logger[status]('message')

        expect(getLoggedHandlingStack(0)).not.toBeDefined()
      })
    })

    it('should not create an handling stack if level is below the logger level', () => {
      logger.setLevel(StatusType.warn)
      logger.log('message')
      logger.warn('message')

      expect(getLoggedHandlingStack(0)).not.toBeDefined()
      expect(getLoggedHandlingStack(1)).toBeDefined()
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
            message: 'Provided "My Error"',
            stack: NO_ERROR_STACK_PRESENT_MESSAGE,
            kind: undefined,
            causes: undefined,
            handling: ErrorHandling.HANDLED,
            fingerprint: undefined,
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
              handling: ErrorHandling.HANDLED,
              causes: [
                { message: 'Mid level error', source: 'logger', type: 'Error', stack: 'Error: Mid level error' },
                {
                  message: 'Low level error',
                  source: 'logger',
                  type: 'TypeError',
                  stack: 'TypeError: Low level error',
                },
              ],
              fingerprint: undefined,
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

  describe('error handling in logImplementation', () => {
    it('should compute stackTrace when error is an instance of Error', () => {
      const error = new Error('Test error')
      logger.log('Test message', undefined, StatusType.error, error)

      const loggedError = getLoggedMessage(0).context?.error

      expect(loggedError).toEqual({
        message: 'Test error',
        stack: jasmine.stringMatching(/^Error: Test error/),
        kind: 'Error',
        causes: undefined,
        handling: ErrorHandling.HANDLED,
        fingerprint: undefined,
      })
    })

    it('should not compute stackTrace when error is not an instance of Error', () => {
      const nonErrorObject = { message: 'Not an Error instance', stack: 'Fake stack trace' }
      logger.log('Test message', undefined, StatusType.error, nonErrorObject as any)

      const loggedError = getLoggedMessage(0).context?.error

      expect(loggedError).toEqual({
        message: 'Provided {"message":"Not an Error instance","stack":"Fake stack trace"}',
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
        kind: undefined,
        causes: undefined,
        handling: ErrorHandling.HANDLED,
        fingerprint: undefined,
      })
    })

    it('should not include error context when error is undefined', () => {
      logger.log('Test message', undefined, StatusType.error, undefined)

      const loggedMessage = getLoggedMessage(0)
      expect(loggedMessage.context).toBeUndefined()
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
