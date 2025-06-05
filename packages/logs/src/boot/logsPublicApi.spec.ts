import type { TimeStamp } from '@datadog/browser-core'
import { monitor, display, removeStorageListeners } from '@datadog/browser-core'
import type { Logger, LogsMessage } from '../domain/logger'
import { HandlerType } from '../domain/logger'
import { StatusType } from '../domain/logger/isAuthorized'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsPublicApi } from './logsPublicApi'
import { makeLogsPublicApi } from './logsPublicApi'
import type { StartLogs } from './startLogs'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }

const mockSessionId = 'some-session-id'
const getInternalContext = () => ({ session_id: mockSessionId })

describe('logs entry', () => {
  let handleLogSpy: jasmine.Spy<
    (
      logsMessage: LogsMessage,
      logger: Logger,
      commonContext: CommonContext | undefined,
      date: TimeStamp | undefined
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

  it('should add a `_setDebug` that works', () => {
    const displaySpy = spyOn(display, 'error')
    const LOGS = makeLogsPublicApi(startLogs)
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

  it('should define the public API with init', () => {
    const LOGS = makeLogsPublicApi(startLogs)
    expect(!!LOGS).toEqual(true)
    expect(!!LOGS.init).toEqual(true)
  })

  it('should provide sdk version', () => {
    const LOGS = makeLogsPublicApi(startLogs)
    expect(LOGS.version).toBe('test')
  })

  describe('common context', () => {
    let LOGS: LogsPublicApi

    beforeEach(() => {
      LOGS = makeLogsPublicApi(startLogs)
      LOGS.init(DEFAULT_INIT_CONFIGURATION)
    })

    it('should have the current date, view and global context', () => {
      LOGS.setGlobalContextProperty('foo', 'bar')

      const getCommonContext = startLogs.calls.mostRecent().args[1]
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

  describe('post start API usages', () => {
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
      it('should get the internal context', () => {
        const LOGS = makeLogsPublicApi(startLogs)
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

        const getCommonContext = startLogs.calls.mostRecent().args[1]
        expect(getCommonContext().user).toEqual({
          email: 'qux',
          foo: { bar: 'qux' },
          id: 'foo',
          name: 'bar',
        })
      })

      it('should sanitize predefined properties', () => {
        const user = { id: false, name: 2, email: { bar: 'qux' } }
        logsPublicApi.setUser(user as any)
        const getCommonContext = startLogs.calls.mostRecent().args[1]
        expect(getCommonContext().user).toEqual({
          email: '[object Object]',
          id: 'false',
          name: '2',
        })
      })

      it('should clear a previously set user', () => {
        const user = { id: 'foo', name: 'bar', email: 'qux' }
        logsPublicApi.setUser(user)
        logsPublicApi.clearUser()

        const getCommonContext = startLogs.calls.mostRecent().args[1]
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

    describe('setAccount', () => {
      let displaySpy: jasmine.Spy<() => void>
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        displaySpy = spyOn(display, 'error')
        logsPublicApi = makeLogsPublicApi(startLogs)
      })

      it('should attach valid objects', () => {
        const account = { id: 'foo', name: 'bar', foo: { bar: 'qux' } }
        logsPublicApi.setAccount(account)

        expect(logsPublicApi.getAccount()).toEqual({
          foo: { bar: 'qux' },
          id: 'foo',
          name: 'bar',
        })
        expect(displaySpy).not.toHaveBeenCalled()
      })

      it('should sanitize predefined properties', () => {
        const account = { id: false, name: 2 }
        logsPublicApi.setAccount(account as any)

        expect(logsPublicApi.getAccount()).toEqual({
          id: 'false',
          name: '2',
        })
        expect(displaySpy).not.toHaveBeenCalled()
      })

      it('should remove the account', () => {
        const account = { id: 'foo', name: 'bar' }
        logsPublicApi.setAccount(account)
        logsPublicApi.clearAccount()

        expect(logsPublicApi.getAccount()).toEqual({})
        expect(displaySpy).not.toHaveBeenCalled()
      })

      it('should reject non object input', () => {
        logsPublicApi.setAccount(2 as any)
        logsPublicApi.setAccount(null as any)
        logsPublicApi.setAccount(undefined as any)
        expect(displaySpy).toHaveBeenCalledTimes(3)
      })
    })

    describe('getAccount', () => {
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        logsPublicApi = makeLogsPublicApi(startLogs)
      })

      it('should return empty object if no account has been set', () => {
        const accountClone = logsPublicApi.getAccount()
        expect(accountClone).toEqual({})
      })

      it('should return a clone of the original object if set', () => {
        const account = { id: 'foo', name: 'bar', foo: { bar: 'qux' } }
        logsPublicApi.setAccount(account)
        const accountClone = logsPublicApi.getAccount()
        const accountClone2 = logsPublicApi.getAccount()

        expect(accountClone).not.toBe(account)
        expect(accountClone).not.toBe(accountClone2)
        expect(accountClone).toEqual(account)
      })
    })

    describe('setAccountProperty', () => {
      const account = { id: 'foo', name: 'bar', foo: { bar: 'qux' } }
      const addressAttribute = { city: 'Paris' }
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        logsPublicApi = makeLogsPublicApi(startLogs)
      })

      it('should add attribute', () => {
        logsPublicApi.setAccount(account)
        logsPublicApi.setAccountProperty('address', addressAttribute)
        const accountClone = logsPublicApi.getAccount()

        expect(accountClone.address).toEqual(addressAttribute)
      })

      it('should not contain original reference to object', () => {
        const accountDetails: { [key: string]: any } = { name: 'company' }
        logsPublicApi.setAccount(account)
        logsPublicApi.setAccountProperty('accountDetails', accountDetails)
        const accountClone = logsPublicApi.getAccount()

        expect(accountClone.accountDetails).not.toBe(accountDetails)
      })

      it('should override attribute', () => {
        logsPublicApi.setAccount(account)
        logsPublicApi.setAccountProperty('foo', addressAttribute)
        const accountClone = logsPublicApi.getAccount()

        expect(accountClone).toEqual({ ...account, foo: addressAttribute })
      })

      it('should sanitize properties', () => {
        logsPublicApi.setAccountProperty('id', 123)
        logsPublicApi.setAccountProperty('name', ['My', 'Company'])
        const accountClone = logsPublicApi.getAccount()

        expect(accountClone.id).toEqual('123')
        expect(accountClone.name).toEqual('My,Company')
      })
    })

    describe('removeAccountProperty', () => {
      let logsPublicApi: LogsPublicApi

      beforeEach(() => {
        logsPublicApi = makeLogsPublicApi(startLogs)
      })
      it('should remove property', () => {
        const account = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }

        logsPublicApi.setAccount(account)
        logsPublicApi.removeAccountProperty('foo')
        const accountClone = logsPublicApi.getAccount()
        expect(accountClone.foo).toBeUndefined()
      })
    })
  })

  describe('storeContextsAcrossPages', () => {
    let logsPublicApi: LogsPublicApi

    beforeEach(() => {
      logsPublicApi = makeLogsPublicApi(startLogs)
    })

    afterEach(() => {
      localStorage.clear()
      removeStorageListeners()
    })

    it('when disabled, should store contexts only in memory', () => {
      logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      logsPublicApi.setGlobalContext({ foo: 'bar' })
      expect(logsPublicApi.getGlobalContext()).toEqual({ foo: 'bar' })
      expect(localStorage.getItem('_dd_c_logs_2')).toBeNull()

      logsPublicApi.setUser({ id: 'foo', qux: 'qix' })
      expect(logsPublicApi.getUser()).toEqual({ id: 'foo', qux: 'qix' })
      expect(localStorage.getItem('_dd_c_logs_1')).toBeNull()
    })

    it('when enabled, should maintain user context in local storage', () => {
      logsPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, storeContextsAcrossPages: true })

      logsPublicApi.setUser({ id: 'foo', qux: 'qix' })
      expect(logsPublicApi.getUser()).toEqual({ id: 'foo', qux: 'qix' })
      expect(localStorage.getItem('_dd_c_logs_1')).toBe('{"id":"foo","qux":"qix"}')

      logsPublicApi.setUserProperty('foo', 'bar')
      expect(logsPublicApi.getUser()).toEqual({ id: 'foo', qux: 'qix', foo: 'bar' })
      expect(localStorage.getItem('_dd_c_logs_1')).toBe('{"id":"foo","qux":"qix","foo":"bar"}')

      logsPublicApi.removeUserProperty('foo')
      expect(logsPublicApi.getUser()).toEqual({ id: 'foo', qux: 'qix' })
      expect(localStorage.getItem('_dd_c_logs_1')).toBe('{"id":"foo","qux":"qix"}')

      logsPublicApi.clearUser()
      expect(logsPublicApi.getUser()).toEqual({})
      expect(localStorage.getItem('_dd_c_logs_1')).toBe('{}')
    })

    it('when enabled, should maintain global context in local storage', () => {
      logsPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, storeContextsAcrossPages: true })

      logsPublicApi.setGlobalContext({ qux: 'qix' })
      expect(logsPublicApi.getGlobalContext()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_logs_2')).toBe('{"qux":"qix"}')

      logsPublicApi.setGlobalContextProperty('foo', 'bar')
      expect(logsPublicApi.getGlobalContext()).toEqual({ qux: 'qix', foo: 'bar' })
      expect(localStorage.getItem('_dd_c_logs_2')).toBe('{"qux":"qix","foo":"bar"}')

      logsPublicApi.removeGlobalContextProperty('foo')
      expect(logsPublicApi.getGlobalContext()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_logs_2')).toBe('{"qux":"qix"}')

      logsPublicApi.clearGlobalContext()
      expect(logsPublicApi.getGlobalContext()).toEqual({})
      expect(localStorage.getItem('_dd_c_logs_2')).toBe('{}')
    })

    // TODO in next major, buffer context calls to correctly apply before init set/remove/clear
    it('when enabled, before init context values should override local storage values', () => {
      localStorage.setItem('_dd_c_logs_1', '{"foo":"bar","qux":"qix"}')
      localStorage.setItem('_dd_c_logs_2', '{"foo":"bar","qux":"qix"}')
      logsPublicApi.setUserProperty('foo', 'user')
      logsPublicApi.setGlobalContextProperty('foo', 'global')

      logsPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, storeContextsAcrossPages: true })

      expect(logsPublicApi.getUser()).toEqual({ foo: 'user', qux: 'qix' })
      expect(logsPublicApi.getGlobalContext()).toEqual({ foo: 'global', qux: 'qix' })
      expect(localStorage.getItem('_dd_c_logs_1')).toBe('{"foo":"user","qux":"qix"}')
      expect(localStorage.getItem('_dd_c_logs_2')).toBe('{"foo":"global","qux":"qix"}')
    })
  })
})
