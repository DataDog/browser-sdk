import { mockClock, type Clock, deleteEventBridgeStub, initEventBridgeStub } from '@datadog/browser-core/test'
import type { TimeStamp } from '@datadog/browser-core'
import { ONE_SECOND, display } from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { HybridInitConfiguration, LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { StatusType, type Logger } from '../domain/logger'
import type { Strategy } from './logsPublicApi'
import { createPreStartStrategy } from './preStartLogs'
import type { StartLogsResult } from './startLogs'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = {} as LogsInitConfiguration

describe('preStartLogs', () => {
  let doStartLogsSpy: jasmine.Spy<
    (initConfiguration: LogsInitConfiguration, configuration: LogsConfiguration) => StartLogsResult
  >
  let handleLogSpy: jasmine.Spy<StartLogsResult['handleLog']>
  let getCommonContextSpy: jasmine.Spy<() => CommonContext>
  let strategy: Strategy
  let clock: Clock

  function getLoggedMessage(index: number) {
    const [message, logger, savedCommonContext, savedDate] = handleLogSpy.calls.argsFor(index)
    return { message, logger, savedCommonContext, savedDate }
  }

  beforeEach(() => {
    handleLogSpy = jasmine.createSpy()
    doStartLogsSpy = jasmine.createSpy().and.returnValue({
      handleLog: handleLogSpy,
    } as unknown as StartLogsResult)
    getCommonContextSpy = jasmine.createSpy()
    strategy = createPreStartStrategy(getCommonContextSpy, doStartLogsSpy)
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  describe('configuration validation', () => {
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
    })

    it('should start when the configuration is valid', () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(displaySpy).not.toHaveBeenCalled()
      expect(doStartLogsSpy).toHaveBeenCalled()
    })

    it('should not start when the configuration is missing', () => {
      ;(strategy.init as () => void)()
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })

    it('should not start when the configuration is invalid', () => {
      strategy.init(INVALID_INIT_CONFIGURATION)
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })

    it("should return init configuration even if it's invalid", () => {
      strategy.init(INVALID_INIT_CONFIGURATION)
      expect(strategy.initConfiguration).toEqual(INVALID_INIT_CONFIGURATION)
    })

    describe('multiple init', () => {
      it('should log an error if init is called several times', () => {
        strategy.init(DEFAULT_INIT_CONFIGURATION)
        expect(displaySpy).toHaveBeenCalledTimes(0)

        strategy.init(DEFAULT_INIT_CONFIGURATION)
        expect(displaySpy).toHaveBeenCalledTimes(1)
      })

      it('should not log an error if init is called several times and silentMultipleInit is true', () => {
        strategy.init({
          ...DEFAULT_INIT_CONFIGURATION,
          silentMultipleInit: true,
        })
        expect(displaySpy).toHaveBeenCalledTimes(0)

        strategy.init({
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
        strategy.init(hybridInitConfiguration as LogsInitConfiguration)

        expect(displaySpy).not.toHaveBeenCalled()
        expect(doStartLogsSpy).toHaveBeenCalled()
      })
    })
  })

  it('allows sending logs', () => {
    strategy.handleLog(
      {
        status: StatusType.info,
        message: 'message',
      },
      {} as Logger
    )

    expect(handleLogSpy).not.toHaveBeenCalled()
    strategy.init(DEFAULT_INIT_CONFIGURATION)

    expect(handleLogSpy.calls.all().length).toBe(1)
    expect(getLoggedMessage(0).message.message).toBe('message')
  })

  it('returns undefined initial configuration', () => {
    expect(strategy.initConfiguration).toBeUndefined()
  })

  describe('save context when submitting a log', () => {
    it('saves the date', () => {
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      clock.tick(ONE_SECOND)
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).savedDate).toEqual((Date.now() - ONE_SECOND) as TimeStamp)
    })

    it('saves the URL', () => {
      getCommonContextSpy.and.returnValue({ view: { url: 'url' } } as unknown as CommonContext)
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).savedCommonContext!.view.url).toEqual('url')
    })

    it('saves the common context', () => {
      getCommonContextSpy.and.returnValue({ context: { foo: 'bar' } } as unknown as CommonContext)
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      getCommonContextSpy.and.returnValue({ context: { foo: 'baz' } } as unknown as CommonContext)

      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).savedCommonContext!.context.foo).toEqual('bar')
    })

    it('saves the log context', () => {
      const context = { foo: 'bar' }
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
          context: { foo: 'bar' },
        },
        {} as Logger
      )
      context.foo = 'baz'

      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).message.context!.foo).toEqual('bar')
    })
  })

  describe('internal context', () => {
    it('should return undefined if not initialized', () => {
      const strategy = createPreStartStrategy(getCommonContextSpy, doStartLogsSpy)
      expect(strategy.getInternalContext()).toBeUndefined()
    })
  })
})
