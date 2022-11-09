import type { TimeStamp } from '@datadog/browser-core'
import { monitor, ONE_SECOND, display } from '@datadog/browser-core'
import type { Clock } from '../../../core/test/specHelper'
import { deleteEventBridgeStub, initEventBridgeStub, mockClock } from '../../../core/test/specHelper'
import type { HybridInitConfiguration, LogsInitConfiguration } from '../domain/configuration'
import type { Logger, LogsMessage } from '../domain/logger'
import { HandlerType, StatusType } from '../domain/logger'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsPublicApi, StartLogs } from './logsPublicApi'
import { makeLogsPublicApi } from './logsPublicApi'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = {} as LogsInitConfiguration

const mockSessionId = 'some-session-id'
const getInternalContext = () => ({ session_id: mockSessionId })

describe('logs entry', () => {
  let handleLogSpy: jasmine.Spy<
    (
      logsMessage: LogsMessage,
      logger: Logger,
      commonContext?: CommonContext | undefined,
      date?: TimeStamp | undefined
    ) => void
  >
  let startLogs: jasmine.Spy<StartLogs>

  function getLoggedMessage(index: number) {
    const [message, logger, savedCommonContext, savedDate] = handleLogSpy.calls.argsFor(index)
    return { message, logger, savedCommonContext, savedDate }
  }

  beforeEach(() => {
    handleLogSpy = jasmine.createSpy()
    startLogs = jasmine.createSpy().and.callFake(() => ({ handleLog: handleLogSpy, getInternalContext }))
  })

  it('should define the public API with init', () => {
    const LOGS = makeLogsPublicApi(startLogs)
    expect(!!LOGS).toEqual(true)
    expect(!!LOGS.init).toEqual(true)
  })

  it('should provide sdk version', () => {
    const LOGS = makeLogsPublicApi(startLogs)
    expect(LOGS.version).toBe('dev')
  })

  describe('configuration validation', () => {
    let LOGS: LogsPublicApi
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      LOGS = makeLogsPublicApi(startLogs)
    })

    it('should start when the configuration is valid', () => {
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
      expect(displaySpy).not.toHaveBeenCalled()
      expect(startLogs).toHaveBeenCalled()
    })

    it('should not start when the configuration is invalid', () => {
      LOGS.init(INVALID_INIT_CONFIGURATION)
      expect(displaySpy).toHaveBeenCalled()
      expect(startLogs).not.toHaveBeenCalled()
    })

    it('should add a `_setDebug` that works', () => {
      const setDebug: (debug: boolean) => void = (LOGS as any)._setDebug
      expect(!!setDebug).toEqual(true)

      monitor(() => {
        throw new Error()
      })()
      expect(displaySpy).toHaveBeenCalledTimes(0)

      setDebug(true)
      monitor(() => {
        throw new Error()
      })()
      expect(displaySpy).toHaveBeenCalledTimes(1)

      setDebug(false)
    })

    describe('multiple init', () => {
      it('should log an error if init is called several times', () => {
        LOGS.init(DEFAULT_INIT_CONFIGURATION)
        expect(displaySpy).toHaveBeenCalledTimes(0)

        LOGS.init(DEFAULT_INIT_CONFIGURATION)
        expect(displaySpy).toHaveBeenCalledTimes(1)
      })

      it('should not log an error if init is called several times and silentMultipleInit is true', () => {
        LOGS.init({
          ...DEFAULT_INIT_CONFIGURATION,
          silentMultipleInit: true,
        })
        expect(displaySpy).toHaveBeenCalledTimes(0)

        LOGS.init({
          ...DEFAULT_INIT_CONFIGURATION,
          silentMultipleInit: true,
        })
        expect(displaySpy).toHaveBeenCalledTimes(0)
      })
    })

    describe('if event bridge present', () => {
      beforeEach(() => {
        initEventBridgeStub()
      })

      afterEach(() => {
        deleteEventBridgeStub()
      })

      it('init should accept empty client token', () => {
        const hybridInitConfiguration: HybridInitConfiguration = {}
        LOGS.init(hybridInitConfiguration as LogsInitConfiguration)

        expect(displaySpy).not.toHaveBeenCalled()
        expect(startLogs).toHaveBeenCalled()
      })
    })
  })

  describe('common context', () => {
    let LOGS: LogsPublicApi

    beforeEach(() => {
      LOGS = makeLogsPublicApi(startLogs)
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
    })

    it('should have the current date, view and global context', () => {
      LOGS.setGlobalContextProperty('foo', 'bar')

      const getCommonContext = startLogs.calls.mostRecent().args[2]
      expect(getCommonContext()).toEqual({
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
        context: { foo: 'bar' },
        user: {},
      })
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

      expect(handleLogSpy).not.toHaveBeenCalled()
      LOGS.init(DEFAULT_INIT_CONFIGURATION)

      expect(handleLogSpy.calls.all().length).toBe(1)
      expect(getLoggedMessage(0).message.message).toBe('message')
    })

    it('allows creating logger', () => {
      const logger = LOGS.createLogger('foo')
      logger.error('message')

      LOGS.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).logger.getContext().logger).toEqual({ name: 'foo' })
      expect(getLoggedMessage(0).message.message).toEqual('message')
    })

    it('returns undefined initial configuration', () => {
      expect(LOGS.getInitConfiguration()).toBeUndefined()
    })

    describe('save context when submitting a log', () => {
      it('saves the date', () => {
        LOGS.logger.log('message')
        clock.tick(ONE_SECOND)
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).savedDate).toEqual((Date.now() - ONE_SECOND) as TimeStamp)
      })

      it('saves the URL', () => {
        const initialLocation = window.location.href
        LOGS.logger.log('message')
        location.href = `#tata${Math.random()}`
        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).savedCommonContext!.view.url).toEqual(initialLocation)
      })

      it('stores a deep copy of the global context', () => {
        LOGS.addLoggerGlobalContext('foo', 'bar')
        LOGS.logger.log('message')
        LOGS.addLoggerGlobalContext('foo', 'baz')

        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).savedCommonContext!.context.foo).toEqual('bar')
      })

      it('stores a deep copy of the log context', () => {
        const context = { foo: 'bar' }
        LOGS.logger.log('message', context)
        context.foo = 'baz'

        LOGS.init(DEFAULT_INIT_CONFIGURATION)

        expect(getLoggedMessage(0).message.context!.foo).toEqual('bar')
      })
    })
  })

  describe('post-init API usages', () => {
    let LOGS: LogsPublicApi

    beforeEach(() => {
      LOGS = makeLogsPublicApi(startLogs)
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
    })

    it('main logger logs a message', () => {
      LOGS.logger.log('message')

      expect(getLoggedMessage(0).message).toEqual({
        message: 'message',
        status: StatusType.info,
        context: undefined,
      })
    })

    it('returns cloned initial configuration', () => {
      expect(LOGS.getInitConfiguration()).toEqual(DEFAULT_INIT_CONFIGURATION)
      expect(LOGS.getInitConfiguration()).not.toBe(DEFAULT_INIT_CONFIGURATION)
    })

    describe('custom loggers', () => {
      it('logs a message', () => {
        const logger = LOGS.createLogger('foo')
        logger.log('message')

        expect(getLoggedMessage(0).message).toEqual({
          message: 'message',
          status: StatusType.info,
          context: undefined,
        })
      })

      it('should have a default configuration', () => {
        const logger = LOGS.createLogger('foo')

        expect(logger.getHandler()).toEqual(HandlerType.http)
        expect(logger.getLevel()).toEqual(StatusType.debug)
      })

      it('should be configurable', () => {
        const logger = LOGS.createLogger('foo', {
          handler: HandlerType.console,
          level: StatusType.info,
        })

        expect(logger.getHandler()).toEqual(HandlerType.console)
        expect(logger.getLevel()).toEqual(StatusType.info)
      })

      it('should be configurable with multiple handlers', () => {
        const logger = LOGS.createLogger('foo', {
          handler: [HandlerType.console, HandlerType.http],
        })

        expect(logger.getHandler()).toEqual([HandlerType.console, HandlerType.http])
      })

      it('should have their name in their context', () => {
        const logger = LOGS.createLogger('foo')

        expect(logger.getContext().logger).toEqual({ name: 'foo' })
      })

      it('could be initialized with a dedicated context', () => {
        const logger = LOGS.createLogger('context', {
          context: { foo: 'bar' },
        })

        expect(logger.getContext().foo).toEqual('bar')
      })

      it('should be retrievable', () => {
        const logger = LOGS.createLogger('foo')
        expect(LOGS.getLogger('foo')).toEqual(logger)
        expect(LOGS.getLogger('bar')).toBeUndefined()
      })
    })

    describe('internal context', () => {
      let LOGS: LogsPublicApi

      beforeEach(() => {
        LOGS = makeLogsPublicApi(startLogs)
      })

      it('should return undefined if not initalized', () => {
        expect(LOGS.getInternalContext()).toBeUndefined()
      })

      it('should get the internal context', () => {
        LOGS.init(DEFAULT_INIT_CONFIGURATION)
        expect(LOGS.getInternalContext()?.session_id).toEqual(mockSessionId)
      })
    })

    describe('setUser', () => {
      let logsPublicApi: LogsPublicApi
      let displaySpy: jasmine.Spy<() => void>

      beforeEach(() => {
        displaySpy = spyOn(display, 'error')
        logsPublicApi = makeLogsPublicApi(startLogs)
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should store user in common context', () => {
        const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
        logsPublicApi.setUser(user)

        const getCommonContext = startLogs.calls.mostRecent().args[2]
        expect(getCommonContext().user).toEqual({
          email: 'qux',
          foo: { bar: 'qux' },
          id: 'foo',
          name: 'bar',
        })
      })

      it('should sanitize predefined properties', () => {
        const user = { id: null, name: 2, email: { bar: 'qux' } }
        logsPublicApi.setUser(user as any)
        const getCommonContext = startLogs.calls.mostRecent().args[2]
        expect(getCommonContext().user).toEqual({
          email: '[object Object]',
          id: 'null',
          name: '2',
        })
      })

      it('should clear a previously set user', () => {
        const user = { id: 'foo', name: 'bar', email: 'qux' }
        logsPublicApi.setUser(user)
        logsPublicApi.clearUser()

        const getCommonContext = startLogs.calls.mostRecent().args[2]
        expect(getCommonContext().user).toEqual({})
      })

      it('should reject non object input', () => {
        logsPublicApi.setUser(2 as any)
        logsPublicApi.setUser(null as any)
        logsPublicApi.setUser(undefined as any)
        expect(displaySpy).toHaveBeenCalledTimes(3)
      })
    })

    describe('getUser', () => {
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        logsPublicApi = makeLogsPublicApi(startLogs)
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should return empty object if no user has been set', () => {
        const userClone = logsPublicApi.getUser()
        expect(userClone).toEqual({})
      })

      it('should return a clone of the original object if set', () => {
        const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
        logsPublicApi.setUser(user)
        const userClone = logsPublicApi.getUser()
        const userClone2 = logsPublicApi.getUser()

        expect(userClone).not.toBe(user)
        expect(userClone).not.toBe(userClone2)
        expect(userClone).toEqual(user)
      })
    })

    describe('setUserProperty', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
      const addressAttribute = { city: 'Paris' }
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        logsPublicApi = makeLogsPublicApi(startLogs)
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should add attribute', () => {
        logsPublicApi.setUser(user)
        logsPublicApi.setUserProperty('address', addressAttribute)
        const userClone = logsPublicApi.getUser()

        expect(userClone.address).toEqual(addressAttribute)
      })

      it('should not contain original reference to object', () => {
        const userDetails: { [key: string]: any } = { name: 'john' }
        logsPublicApi.setUser(user)
        logsPublicApi.setUserProperty('userDetails', userDetails)
        userDetails.DOB = '11/11/1999'
        const userClone = logsPublicApi.getUser()

        expect(userClone.userDetails).not.toBe(userDetails)
      })

      it('should override attribute', () => {
        logsPublicApi.setUser(user)
        logsPublicApi.setUserProperty('foo', addressAttribute)
        const userClone = logsPublicApi.getUser()

        expect(userClone).toEqual({ ...user, foo: addressAttribute })
      })

      it('should sanitize properties', () => {
        logsPublicApi.setUserProperty('id', 123)
        logsPublicApi.setUserProperty('name', ['Adam', 'Smith'])
        logsPublicApi.setUserProperty('email', { foo: 'bar' })
        const userClone = logsPublicApi.getUser()

        expect(userClone.id).toEqual('123')
        expect(userClone.name).toEqual('Adam,Smith')
        expect(userClone.email).toEqual('[object Object]')
      })
    })

    describe('removeUserProperty', () => {
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        logsPublicApi = makeLogsPublicApi(startLogs)
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should remove property', () => {
        const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }

        logsPublicApi.setUser(user)
        logsPublicApi.removeUserProperty('foo')
        const userClone = logsPublicApi.getUser()
        expect(userClone.foo).toBeUndefined()
      })
    })
  })
})
