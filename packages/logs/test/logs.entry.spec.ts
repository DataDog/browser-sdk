import { mockModule, unmockModules } from '../../../test/unit/mockModule'

import {
  Configuration,
  DEFAULT_CONFIGURATION,
  ErrorMessage,
  monitor,
  Observable,
  ONE_SECOND,
} from '@datadog/browser-core'
import sinon from 'sinon'

import { HandlerType, LogsMessage, StatusType } from '../src/logger'
import { LogsGlobal, makeLogsGlobal } from '../src/logs.entry'

interface SentMessage extends LogsMessage {
  logger?: { name: string }
  view: {
    referrer: string
    url: string
  }
}

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as SentMessage
}
const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }
const FAKE_DATE = 123456
const configuration: Partial<Configuration> = {
  ...DEFAULT_CONFIGURATION,
  logsEndpoint: 'https://localhost/v1/input/log',
  maxBatchSize: 1,
  service: 'Service',
}

function makeLogsGlobalWithDefaults({
  configuration: overrideConfiguration,
}: {
  configuration?: Partial<Configuration>
}) {
  return makeLogsGlobal(() => ({
    configuration: { ...(configuration as Configuration), ...overrideConfiguration },
    errorObservable: new Observable<ErrorMessage>(),
    internalMonitoring: { setExternalContextProvider: () => undefined },
  }))
}

describe('logs entry', () => {
  let sessionIsTracked: boolean

  beforeEach(() => {
    sessionIsTracked = true
    mockModule('./packages/logs/src/loggerSession.ts', () => ({
      startLoggerSession() {
        return {
          getId: () => undefined,
          isTracked: () => sessionIsTracked,
        }
      },
    }))
  })

  afterEach(() => {
    unmockModules()
  })

  it('should set global with init', () => {
    sessionIsTracked = false
    const LOGS = makeLogsGlobalWithDefaults({})
    expect(!!LOGS).toEqual(true)
    expect(!!LOGS.init).toEqual(true)
  })

  describe('configuration validation', () => {
    let LOGS: LogsGlobal

    beforeEach(() => {
      sessionIsTracked = false
      LOGS = makeLogsGlobalWithDefaults({})
    })

    it('init should log an error with no public api key', () => {
      const errorSpy = spyOn(console, 'error')

      LOGS.init(undefined as any)
      expect(console.error).toHaveBeenCalledTimes(1)

      LOGS.init({ stillNoApiKey: true } as any)
      expect(console.error).toHaveBeenCalledTimes(2)

      LOGS.init({ clientToken: 'yeah' })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('should warn if now deprecated publicApiKey is used', () => {
      spyOn(console, 'warn')

      LOGS.init({ publicApiKey: 'yo' } as any)
      expect(console.warn).toHaveBeenCalledTimes(1)
    })

    it('should add a `_setDebug` that works', () => {
      const setDebug: (debug: boolean) => void = (LOGS as any)._setDebug as any
      expect(!!setDebug).toEqual(true)

      spyOn(console, 'warn')
      monitor(() => {
        throw new Error()
      })()
      expect(console.warn).toHaveBeenCalledTimes(0)

      setDebug(true)
      monitor(() => {
        throw new Error()
      })()
      expect(console.warn).toHaveBeenCalledTimes(1)

      setDebug(false)
    })

    it('init should log an error if sampleRate is invalid', () => {
      const errorSpy = spyOn(console, 'error')
      LOGS.init({ clientToken: 'yes', sampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      LOGS.init({ clientToken: 'yes', sampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('should log an error if init is called several times', () => {
      const errorSpy = spyOn(console, 'error')
      LOGS.init({ clientToken: 'yes', sampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      LOGS.init({ clientToken: 'yes', sampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should not log an error if init is called several times and silentMultipleInit is true', () => {
      const errorSpy = spyOn(console, 'error')
      LOGS.init({
        clientToken: 'yes',
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      LOGS.init({
        clientToken: 'yes',
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it("shouldn't trigger any console.log if the configuration is correct", () => {
      const errorSpy = spyOn(console, 'error')
      LOGS.init({ clientToken: 'yes', sampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('pre-init API usages', () => {
    let server: sinon.SinonFakeServer
    let LOGS: LogsGlobal

    beforeEach(() => {
      LOGS = makeLogsGlobalWithDefaults({})
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
      server = sinon.fakeServer.create()
      jasmine.clock().install()
      jasmine.clock().mockDate(new Date(FAKE_DATE))
    })

    afterEach(() => {
      server.restore()
      jasmine.clock().uninstall()
    })

    it('allows sending logs', () => {
      LOGS = makeLogsGlobalWithDefaults({})
      LOGS.logger.log('message')

      expect(server.requests.length).toEqual(0)
      LOGS.init({ clientToken: 'xxx', site: 'test' })

      expect(server.requests.length).toEqual(1)
      expect(getLoggedMessage(server, 0).message).toBe('message')
    })

    it('allows creating logger', () => {
      LOGS = makeLogsGlobalWithDefaults({})
      const logger = LOGS.createLogger('1')
      logger.error('message')

      LOGS.init({ clientToken: 'xxx', site: 'test' })

      expect(getLoggedMessage(server, 0).logger!.name).toEqual('1')
      expect(getLoggedMessage(server, 0).message).toEqual('message')
    })

    describe('save context when submiting a log', () => {
      it('saves the date', () => {
        LOGS = makeLogsGlobalWithDefaults({})
        LOGS.logger.log('message')
        jasmine.clock().tick(ONE_SECOND)
        LOGS.init({ clientToken: 'xxx', site: 'test' })

        expect(getLoggedMessage(server, 0).date).toEqual(Date.now() - ONE_SECOND)
      })

      it('saves the URL', () => {
        const initialLocation = window.location.href
        LOGS = makeLogsGlobalWithDefaults({})
        LOGS.logger.log('message')
        location.href = `#tata${Math.random()}`
        LOGS.init({ clientToken: 'xxx', site: 'test' })

        expect(getLoggedMessage(server, 0).view!.url).toEqual(initialLocation)
      })

      it('saves the global context', () => {
        LOGS = makeLogsGlobalWithDefaults({})
        LOGS.addLoggerGlobalContext('foo', 'bar')
        LOGS.logger.log('message')
        LOGS.addLoggerGlobalContext('foo', 'baz')

        LOGS.init({ clientToken: 'xxx', site: 'test' })

        expect(getLoggedMessage(server, 0).foo).toEqual('bar')
      })
    })

    it('should not send logs if the session is not tracked', () => {
      sessionIsTracked = false
      LOGS = makeLogsGlobalWithDefaults({})
      LOGS.logger.log('message')

      expect(server.requests.length).toEqual(0)
      LOGS.init({ clientToken: 'xxx', site: 'test' })

      expect(server.requests.length).toEqual(0)
    })
  })

  describe('post-init API usages', () => {
    let server: sinon.SinonFakeServer
    let LOGS: LogsGlobal

    beforeEach(() => {
      LOGS = makeLogsGlobalWithDefaults({})
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
      server = sinon.fakeServer.create()
      jasmine.clock().install()
      jasmine.clock().mockDate(new Date(FAKE_DATE))
    })

    afterEach(() => {
      server.restore()
      jasmine.clock().uninstall()
    })

    describe('request', () => {
      it('should send the needed data', () => {
        LOGS.logger.log('message', { foo: 'bar' }, StatusType.warn)

        expect(server.requests.length).toEqual(1)
        expect(server.requests[0].url).toEqual(configuration.logsEndpoint!)
        expect(getLoggedMessage(server, 0)).toEqual({
          date: FAKE_DATE,
          foo: 'bar',
          message: 'message',
          service: 'Service',
          status: StatusType.warn,
          view: {
            referrer: document.referrer,
            url: window.location.href,
          },
        })
      })
    })

    describe('global context', () => {
      it('should be added to the request', () => {
        LOGS.setLoggerGlobalContext({ bar: 'foo' })
        LOGS.logger.log('message')

        expect(getLoggedMessage(server, 0).bar).toEqual('foo')
      })

      it('should be updatable', () => {
        LOGS.setLoggerGlobalContext({ bar: 'foo' })
        LOGS.logger.log('first')
        LOGS.setLoggerGlobalContext({ foo: 'bar' })
        LOGS.logger.log('second')

        expect(getLoggedMessage(server, 0).bar).toEqual('foo')
        expect(getLoggedMessage(server, 1).foo).toEqual('bar')
        expect(getLoggedMessage(server, 1).bar).toBeUndefined()
      })

      it('should be removable', () => {
        LOGS.addLoggerGlobalContext('bar', 'foo')
        LOGS.logger.log('first')
        LOGS.removeLoggerGlobalContext('bar')
        LOGS.logger.log('second')

        expect(getLoggedMessage(server, 0).bar).toEqual('foo')
        expect(getLoggedMessage(server, 1).bar).toBeUndefined()
      })

      it('should be used by all loggers', () => {
        LOGS.setLoggerGlobalContext({ foo: 'bar' })
        const logger1 = LOGS.createLogger('1')
        const logger2 = LOGS.createLogger('2')

        logger1.debug('message')
        logger2.debug('message')

        expect(getLoggedMessage(server, 0).foo).toEqual('bar')
        expect(getLoggedMessage(server, 1).foo).toEqual('bar')
      })
    })

    describe('custom loggers', () => {
      beforeEach(() => {
        spyOn(console, 'log')
      })

      it('should have a default configuration', () => {
        const logger = LOGS.createLogger('foo')

        logger.debug('message')

        expect(server.requests.length).toEqual(1)
        expect(console.log).not.toHaveBeenCalled()
      })

      it('should be configurable', () => {
        const logger = LOGS.createLogger('foo', {
          handler: HandlerType.console,
          level: StatusType.info,
        })

        logger.debug('ignored')
        logger.error('message')

        expect(server.requests.length).toEqual(0)
        expect(console.log).toHaveBeenCalledWith('error: message')
      })

      it('should have their name in their context', () => {
        const logger = LOGS.createLogger('foo')

        logger.debug('message')

        expect(getLoggedMessage(server, 0).logger!.name).toEqual('foo')
      })

      it('could be initialized with a dedicated context', () => {
        const logger = LOGS.createLogger('context', {
          context: { foo: 'bar' },
        })

        logger.debug('message')

        expect(getLoggedMessage(server, 0).foo).toEqual('bar')
      })

      it('should be retrievable', () => {
        const logger = LOGS.createLogger('foo')
        expect(LOGS.getLogger('foo')).toEqual(logger)
        expect(LOGS.getLogger('bar')).toBeUndefined()
      })

      it('should all use the same batch', () => {
        LOGS = makeLogsGlobalWithDefaults({ configuration: { maxBatchSize: 3 } })
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        const logger1 = LOGS.createLogger('1')
        const logger2 = LOGS.createLogger('2')

        LOGS.logger.debug('message from default')
        logger1.debug('message from logger1')
        logger2.debug('message from logger2')

        expect(server.requests.length).toEqual(1)
      })
    })

    describe('logger session', () => {
      it('when tracked should enable disable logging', () => {
        LOGS = makeLogsGlobalWithDefaults({})
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        LOGS.logger.log('message')
        expect(server.requests.length).toEqual(1)
      })

      it('when not tracked should disable logging', () => {
        sessionIsTracked = false
        LOGS = makeLogsGlobalWithDefaults({})
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        LOGS.logger.log('message')
        expect(server.requests.length).toEqual(0)
      })

      it('when type change should enable/disable existing loggers', () => {
        LOGS = makeLogsGlobalWithDefaults({})
        LOGS.init(DEFAULT_INIT_CONFIGURATION)
        const testLogger = LOGS.createLogger('test')

        LOGS.logger.log('message')
        testLogger.log('message')
        expect(server.requests.length).toEqual(2)

        sessionIsTracked = false
        LOGS.logger.log('message')
        testLogger.log('message')
        expect(server.requests.length).toEqual(2)

        sessionIsTracked = true
        LOGS.logger.log('message')
        testLogger.log('message')
        expect(server.requests.length).toEqual(4)
      })
    })
  })
})
