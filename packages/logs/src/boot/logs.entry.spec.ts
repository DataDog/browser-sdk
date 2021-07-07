import { Context, monitor, ONE_SECOND, display } from '@datadog/browser-core'
import { Clock, mockClock } from '../../../core/test/specHelper'

import { HandlerType, LogsMessage, StatusType } from '../domain/logger'
import { LogsPublicApi, makeLogsPublicApi, StartLogs } from './logs.entry'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }

describe('logs entry', () => {
  let sendLogsSpy: jasmine.Spy<
    (
      message: LogsMessage & { logger?: { name: string } },
      currentContext: Context & { view: { referrer: string; url: string } }
    ) => void
  >
  let startLogsGetGlobalContext: (() => Context) | undefined
  const startLogs: StartLogs = (_configuration, _logger, getGlobalContext) => {
    startLogsGetGlobalContext = getGlobalContext
    return (sendLogsSpy as any) as ReturnType<StartLogs>
  }

  function getLoggedMessage(index: number) {
    const [message, context] = sendLogsSpy.calls.argsFor(index)
    return { message, context }
  }

  beforeEach(() => {
    sendLogsSpy = jasmine.createSpy()
    startLogsGetGlobalContext = undefined
  })

  it('should define the public API with init', () => {
    const LOGS = makeLogsPublicApi(startLogs)
    expect(!!LOGS).toEqual(true)
    expect(!!LOGS.init).toEqual(true)
  })

  describe('configuration validation', () => {
    let LOGS: LogsPublicApi

    beforeEach(() => {
      LOGS = makeLogsPublicApi(startLogs)
    })

    it('init should log an error with no public api key', () => {
      const displaySpy = spyOn(display, 'error')

      LOGS.init(undefined as any)
      expect(display.error).toHaveBeenCalledTimes(1)

      LOGS.init({ stillNoApiKey: true } as any)
      expect(display.error).toHaveBeenCalledTimes(2)

      LOGS.init({ clientToken: 'yeah' })
      expect(displaySpy).toHaveBeenCalledTimes(2)
    })

    it('should warn if now deprecated publicApiKey is used', () => {
      spyOn(display, 'warn')

      LOGS.init({ publicApiKey: 'yo' } as any)
      expect(display.warn).toHaveBeenCalledTimes(1)
    })

    it('should add a `_setDebug` that works', () => {
      const setDebug: (debug: boolean) => void = (LOGS as any)._setDebug
      expect(!!setDebug).toEqual(true)

      spyOn(display, 'error')
      monitor(() => {
        throw new Error()
      })()
      expect(display.error).toHaveBeenCalledTimes(0)

      setDebug(true)
      monitor(() => {
        throw new Error()
      })()
      expect(display.error).toHaveBeenCalledTimes(1)

      setDebug(false)
    })

    it('init should log an error if sampleRate is invalid', () => {
      const displaySpy = spyOn(display, 'error')
      LOGS.init({ clientToken: 'yes', sampleRate: 'foo' as any })
      expect(displaySpy).toHaveBeenCalledTimes(1)

      LOGS.init({ clientToken: 'yes', sampleRate: 200 })
      expect(displaySpy).toHaveBeenCalledTimes(2)
    })

    it('should log an error if init is called several times', () => {
      const displaySpy = spyOn(display, 'error')
      LOGS.init({ clientToken: 'yes', sampleRate: 1 })
      expect(displaySpy).toHaveBeenCalledTimes(0)

      LOGS.init({ clientToken: 'yes', sampleRate: 1 })
      expect(displaySpy).toHaveBeenCalledTimes(1)
    })

    it('should not log an error if init is called several times and silentMultipleInit is true', () => {
      const displaySpy = spyOn(display, 'error')
      LOGS.init({
        clientToken: 'yes',
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(displaySpy).toHaveBeenCalledTimes(0)

      LOGS.init({
        clientToken: 'yes',
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(displaySpy).toHaveBeenCalledTimes(0)
    })

    it("shouldn't trigger any console.error if the configuration is correct", () => {
      const displaySpy = spyOn(display, 'error')
      LOGS.init({ clientToken: 'yes', sampleRate: 1 })
      expect(displaySpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('pre-init API usages', () => {
    let LOGS: LogsPublicApi
    let clock: Clock

    beforeEach(() => {
      LOGS = makeLogsPublicApi(startLogs)
      clock = mockClock()
    })

    afterEach(() => {
      clock.cleanup()
    })

    it('allows sending logs', () => {
      LOGS.logger.log('message')

      expect(sendLogsSpy).not.toHaveBeenCalled()
      LOGS.init(DEFAULT_INIT_CONFIGURATION)

      expect(sendLogsSpy.calls.all().length).toBe(1)
      expect(getLoggedMessage(0).message.message).toBe('message')
    })

    it('allows creating logger', () => {
      const logger = LOGS.createLogger('1')
      logger.error('message')

      LOGS.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).message.logger!.name).toEqual('1')
      expect(getLoggedMessage(0).message.message).toEqual('message')
    })

    it('returns undefined initial configuration', () => {
      expect(LOGS.getInitConfiguration()).toBeUndefined()
    })

    describe('save context when submiting a log', () => {
      it('saves the date', () => {
        LOGS.logger.log('message')
        clock.tick(ONE_SECOND)
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).context.date).toEqual(Date.now() - ONE_SECOND)
      })

      it('saves the URL', () => {
        const initialLocation = window.location.href
        LOGS.logger.log('message')
        location.href = `#tata${Math.random()}`
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).context.view.url).toEqual(initialLocation)
      })

      it('stores a deep copy of the global context', () => {
        LOGS.addLoggerGlobalContext('foo', 'bar')
        LOGS.logger.log('message')
        LOGS.addLoggerGlobalContext('foo', 'baz')

        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).context.foo).toEqual('bar')
      })

      it('stores a deep copy of the log context', () => {
        const context = { foo: 'bar' }
        LOGS.logger.log('message', context)
        context.foo = 'baz'

        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).message.foo).toEqual('bar')
      })
    })
  })

  describe('post-init API usages', () => {
    let LOGS: LogsPublicApi

    beforeEach(() => {
      LOGS = makeLogsPublicApi(startLogs)
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
    })

    it('logs a message', () => {
      LOGS.logger.log('message')

      expect(getLoggedMessage(0)).toEqual({
        context: {
          date: jasmine.any(Number),
          view: {
            referrer: document.referrer,
            url: location.href,
          },
        },
        message: {
          message: 'message',
          status: StatusType.info,
        },
      })
    })

    it('returns cloned initial configuration', () => {
      expect(LOGS.getInitConfiguration()).toEqual(DEFAULT_INIT_CONFIGURATION)
      expect(LOGS.getInitConfiguration()).not.toBe(DEFAULT_INIT_CONFIGURATION)
    })

    describe('global context', () => {
      it('should be added to the request', () => {
        LOGS.setLoggerGlobalContext({ bar: 'foo' })
        LOGS.logger.log('message')

        expect(getLoggedMessage(0).context.bar).toEqual('foo')
      })

      it('should be used by all loggers', () => {
        LOGS.setLoggerGlobalContext({ foo: 'bar' })
        const logger1 = LOGS.createLogger('1')
        const logger2 = LOGS.createLogger('2')

        logger1.debug('message')
        logger2.debug('message')

        expect(getLoggedMessage(0).context.foo).toEqual('bar')
        expect(getLoggedMessage(1).context.foo).toEqual('bar')
      })

      it('should expose global context to startLogs', () => {
        LOGS.setLoggerGlobalContext({ foo: 'bar' })
        expect(startLogsGetGlobalContext!()).toEqual({ foo: 'bar' })
      })
    })

    describe('custom loggers', () => {
      beforeEach(() => {
        spyOn(display, 'log')
      })

      it('should have a default configuration', () => {
        const logger = LOGS.createLogger('foo')

        logger.debug('message')

        expect(sendLogsSpy.calls.count()).toEqual(1)
        expect(display.log).not.toHaveBeenCalled()
      })

      it('should be configurable', () => {
        const logger = LOGS.createLogger('foo', {
          handler: HandlerType.console,
          level: StatusType.info,
        })

        logger.debug('ignored')
        logger.error('message')

        expect(sendLogsSpy).not.toHaveBeenCalled()
        expect(display.log).toHaveBeenCalledWith('error: message', {
          error: { origin: 'logger' },
          logger: { name: 'foo' },
        })
      })

      it('should be configurable with multiple handlers', () => {
        const logger = LOGS.createLogger('foo', {
          handler: [HandlerType.console, HandlerType.http],
          level: StatusType.debug,
        })

        logger.debug('message')

        expect(sendLogsSpy).toHaveBeenCalled()
        expect(display.log).toHaveBeenCalledWith('debug: message', { logger: { name: 'foo' } })
      })

      it('should have their name in their context', () => {
        const logger = LOGS.createLogger('foo')

        logger.debug('message')

        expect(getLoggedMessage(0).message.logger!.name).toEqual('foo')
      })

      it('could be initialized with a dedicated context', () => {
        const logger = LOGS.createLogger('context', {
          context: { foo: 'bar' },
        })

        logger.debug('message')

        expect(getLoggedMessage(0).message.foo).toEqual('bar')
      })

      it('should be retrievable', () => {
        const logger = LOGS.createLogger('foo')
        expect(LOGS.getLogger('foo')).toEqual(logger)
        expect(LOGS.getLogger('bar')).toBeUndefined()
      })
    })
  })
})
