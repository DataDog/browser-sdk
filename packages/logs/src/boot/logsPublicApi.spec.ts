import type { ContextManager, TimeStamp } from '@datadog/browser-core'
import { monitor, display, createContextManager } from '@datadog/browser-core'
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

      const getCommonContext = startLogs.calls.mostRecent().args[2]
      expect(getCommonContext()).toEqual({
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
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

    describe('user', () => {
      let logsPublicApi: LogsPublicApi
      let userContext: ContextManager
      beforeEach(() => {
        userContext = createContextManager('mock')
        startLogs = jasmine
          .createSpy()
          .and.callFake(() => ({ handleLog: handleLogSpy, getInternalContext, userContext }))

        logsPublicApi = makeLogsPublicApi(startLogs)

        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should call setContext', () => {
        spyOn(userContext, 'setContext')
        logsPublicApi.setUser(2 as any)
        expect(userContext.setContext).toHaveBeenCalledTimes(1)
      })

      it('should call setContextProperty', () => {
        spyOn(userContext, 'setContextProperty')
        logsPublicApi.setUserProperty('foo', 'bar')
        expect(userContext.setContextProperty).toHaveBeenCalledTimes(1)
      })

      it('should call removeContextProperty', () => {
        spyOn(userContext, 'removeContextProperty')
        logsPublicApi.removeUserProperty('foo')
        expect(userContext.removeContextProperty).toHaveBeenCalledTimes(1)
      })

      it('should call clearContext', () => {
        spyOn(userContext, 'clearContext')
        logsPublicApi.clearUser()
        expect(userContext.clearContext).toHaveBeenCalledTimes(1)
      })
    })

    describe('account', () => {
      let logsPublicApi: LogsPublicApi
      let accountContext: ContextManager
      beforeEach(() => {
        accountContext = createContextManager('mock')
        startLogs = jasmine.createSpy().and.callFake(() => ({
          handleLog: handleLogSpy,
          getInternalContext,
          accountContext,
        }))

        logsPublicApi = makeLogsPublicApi(startLogs)

        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should call setContext', () => {
        spyOn(accountContext, 'setContext')
        logsPublicApi.setAccount(2 as any)
        expect(accountContext.setContext).toHaveBeenCalledTimes(1)
      })

      it('should call setContextProperty', () => {
        spyOn(accountContext, 'setContextProperty')
        logsPublicApi.setAccountProperty('foo', 'bar')
        expect(accountContext.setContextProperty).toHaveBeenCalledTimes(1)
      })

      it('should call removeContextProperty', () => {
        spyOn(accountContext, 'removeContextProperty')
        logsPublicApi.removeAccountProperty('foo')
        expect(accountContext.removeContextProperty).toHaveBeenCalledTimes(1)
      })

      it('should call clearContext', () => {
        spyOn(accountContext, 'clearContext')
        logsPublicApi.clearAccount()
        expect(accountContext.clearContext).toHaveBeenCalledTimes(1)
      })
    })
  })
})
