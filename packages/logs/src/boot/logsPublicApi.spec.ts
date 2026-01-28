import type { ContextManager } from '@datadog/browser-core'
import { monitor, display, createContextManager, TrackingConsent } from '@datadog/browser-core'
import { HandlerType } from '../domain/logger'
import { StatusType } from '../domain/logger/isAuthorized'
import { createFakeTelemetryObject } from '../../../core/test'
import type { LogsPublicApi } from './logsPublicApi'
import { makeLogsPublicApi } from './logsPublicApi'
import type { StartLogs, StartLogsResult } from './startLogs'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx', trackingConsent: TrackingConsent.GRANTED }

const mockSessionId = 'some-session-id'
const getInternalContext = () => ({ session_id: mockSessionId })

describe('logs entry', () => {
  it('should add a `_setDebug` that works', () => {
    const displaySpy = spyOn(display, 'error')
    const { logsPublicApi } = makeLogsPublicApiWithDefaults()
    const setDebug: (debug: boolean) => void = (logsPublicApi as any)._setDebug
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
    const { logsPublicApi } = makeLogsPublicApiWithDefaults()
    expect(!!logsPublicApi).toEqual(true)
    expect(!!logsPublicApi.init).toEqual(true)
  })

  it('should provide sdk version', () => {
    const { logsPublicApi } = makeLogsPublicApiWithDefaults()
    expect(logsPublicApi.version).toBe('test')
  })

  describe('common context', () => {
    let logsPublicApi: LogsPublicApi
    let startLogsSpy: jasmine.Spy<StartLogs>

    beforeEach(() => {
      ;({ logsPublicApi, startLogsSpy } = makeLogsPublicApiWithDefaults())
      logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
    })

    it('should have the current date, view and global context', () => {
      logsPublicApi.setGlobalContextProperty('foo', 'bar')

      const getCommonContext = startLogsSpy.calls.mostRecent().args[1]
      expect(getCommonContext()).toEqual({
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      })
    })
  })

  describe('post start API usages', () => {
    let logsPublicApi: LogsPublicApi
    let getLoggedMessage: ReturnType<typeof makeLogsPublicApiWithDefaults>['getLoggedMessage']

    beforeEach(() => {
      ;({ logsPublicApi, getLoggedMessage } = makeLogsPublicApiWithDefaults())
      logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
    })

    it('main logger logs a message', () => {
      logsPublicApi.logger.log('message')

      expect(getLoggedMessage(0).message).toEqual({
        message: 'message',
        status: StatusType.info,
        context: undefined,
      })
    })

    it('returns cloned initial configuration', () => {
      expect(logsPublicApi.getInitConfiguration()).toEqual(DEFAULT_INIT_CONFIGURATION)
      expect(logsPublicApi.getInitConfiguration()).not.toBe(DEFAULT_INIT_CONFIGURATION)
    })

    describe('custom loggers', () => {
      it('logs a message', () => {
        const logger = logsPublicApi.createLogger('foo')
        logger.log('message')

        expect(getLoggedMessage(0).message).toEqual({
          message: 'message',
          status: StatusType.info,
          context: undefined,
        })
      })

      it('should have a default configuration', () => {
        const logger = logsPublicApi.createLogger('foo')

        expect(logger.getHandler()).toEqual(HandlerType.http)
        expect(logger.getLevel()).toEqual(StatusType.debug)
      })

      it('should be configurable', () => {
        const logger = logsPublicApi.createLogger('foo', {
          handler: HandlerType.console,
          level: StatusType.info,
        })

        expect(logger.getHandler()).toEqual(HandlerType.console)
        expect(logger.getLevel()).toEqual(StatusType.info)
      })

      it('should be configurable with multiple handlers', () => {
        const logger = logsPublicApi.createLogger('foo', {
          handler: [HandlerType.console, HandlerType.http],
        })

        expect(logger.getHandler()).toEqual([HandlerType.console, HandlerType.http])
      })

      it('should have their name in their context', () => {
        const logger = logsPublicApi.createLogger('foo')

        expect(logger.getContext().logger).toEqual({ name: 'foo' })
      })

      it('could be initialized with a dedicated context', () => {
        const logger = logsPublicApi.createLogger('context', {
          context: { foo: 'bar' },
        })

        expect(logger.getContext().foo).toEqual('bar')
      })

      it('should be retrievable', () => {
        const logger = logsPublicApi.createLogger('foo')
        expect(logsPublicApi.getLogger('foo')).toEqual(logger)
        expect(logsPublicApi.getLogger('bar')).toBeUndefined()
      })
    })

    describe('internal context', () => {
      it('should get the internal context', () => {
        const { logsPublicApi } = makeLogsPublicApiWithDefaults()
        logsPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(logsPublicApi.getInternalContext()?.session_id).toEqual(mockSessionId)
      })
    })

    describe('user', () => {
      let logsPublicApi: LogsPublicApi
      let userContext: ContextManager
      beforeEach(() => {
        userContext = createContextManager('mock')
        ;({ logsPublicApi } = makeLogsPublicApiWithDefaults({
          startLogsResult: {
            userContext,
          },
        }))

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
        ;({ logsPublicApi } = makeLogsPublicApiWithDefaults({
          startLogsResult: {
            accountContext,
          },
        }))

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

function makeLogsPublicApiWithDefaults({
  startLogsResult,
}: {
  startLogsResult?: Partial<StartLogsResult>
} = {}) {
  const handleLogSpy = jasmine.createSpy<StartLogsResult['handleLog']>()
  const startLogsSpy = jasmine.createSpy<StartLogs>().and.callFake(() => ({
    handleLog: handleLogSpy,
    getInternalContext,
    accountContext: {} as any,
    globalContext: {} as any,
    userContext: {} as any,
    stop: () => undefined,
    ...startLogsResult,
  }))

  function getLoggedMessage(index: number) {
    const [message, logger, savedCommonContext, savedDate] = handleLogSpy.calls.argsFor(index)
    return { message, logger, savedCommonContext, savedDate }
  }

  return {
    startLogsSpy,
    logsPublicApi: makeLogsPublicApi(startLogsSpy, createFakeTelemetryObject),
    getLoggedMessage,
  }
}
