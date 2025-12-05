import type { ContextManager, TimeStamp } from '@datadog/browser-core'
import { monitor, display, createContextManager, ErrorSource } from '@datadog/browser-core'
import type { Logger, LogsMessage } from '../domain/logger'
import { HandlerType } from '../domain/logger'
import { StatusType } from '../domain/logger/isAuthorized'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsPublicApi } from './logsPublicApi'
import { makeLogsPublicApi } from './logsPublicApi'
import type { StartLogs } from './startLogs'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'

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

    describe('sendRawLog', () => {
      let logsPublicApi: LogsPublicApi
      let mockLifeCycle: LifeCycle
      let logCollectedSpy: jasmine.Spy

      beforeEach(() => {
        mockLifeCycle = new LifeCycle()
        logCollectedSpy = jasmine.createSpy('logCollected')
        mockLifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, logCollectedSpy)

        startLogs = jasmine.createSpy().and.callFake(() => ({
          handleLog: handleLogSpy,
          getInternalContext,
          lifeCycle: mockLifeCycle,
        }))

        logsPublicApi = makeLogsPublicApi(startLogs)
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      })

      it('should send log directly to LOG_COLLECTED event', () => {
        const log = {
          date: 1234567890,
          message: 'test message',
          status: 'info' as const,
          origin: ErrorSource.LOGGER,
          ddsource: 'dd_debugger',
          hostname: 'test-hostname',
        }

        logsPublicApi.sendRawLog(log)

        expect(logCollectedSpy).toHaveBeenCalledTimes(1)
        expect(logCollectedSpy).toHaveBeenCalledWith(log)
      })

      it('should bypass assembly (no default context added)', () => {
        const log = {
          date: 1234567890,
          message: 'test message',
          status: 'info' as const,
          origin: ErrorSource.LOGGER,
          ddsource: 'dd_debugger',
          hostname: 'test-hostname',
          logger: { name: 'test-logger' },
          dd: { version: '1.0' },
          debugger: { snapshot: { captures: [] } },
        }

        logsPublicApi.sendRawLog(log)

        expect(logCollectedSpy).toHaveBeenCalledTimes(1)
        const collectedLog = logCollectedSpy.calls.mostRecent().args[0]
        // Verify the log is sent as-is without default context
        expect(collectedLog).toBe(log)
        expect(collectedLog.ddsource).toBe('dd_debugger')
        expect(collectedLog.logger).toEqual({ name: 'test-logger' })
        expect(collectedLog.dd).toEqual({ version: '1.0' })
        expect(collectedLog.debugger).toEqual({ snapshot: { captures: [] } })
        // Verify no default view context was added
        expect(collectedLog.view).toBeUndefined()
      })

      it('should handle when lifecycle is not available', () => {
        startLogs = jasmine.createSpy().and.callFake(() => ({
          handleLog: handleLogSpy,
          getInternalContext,
          // No lifeCycle
        }))

        logsPublicApi = makeLogsPublicApi(startLogs)
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        const log = {
          date: 1234567890,
          message: 'test message',
          status: 'info' as const,
          origin: ErrorSource.LOGGER,
        }

        expect(() => {
          logsPublicApi.sendRawLog(log)
        }).not.toThrow()
      })
    })
  })
})
