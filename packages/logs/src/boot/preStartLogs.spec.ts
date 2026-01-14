import {
  callbackAddsInstrumentation,
  type Clock,
  mockClock,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  waitNextMicrotask,
  waitFor,
} from '@datadog/browser-core/test'
import type { TimeStamp, TrackingConsentState } from '@datadog/browser-core'
import {
  ONE_SECOND,
  SESSION_STORE_KEY,
  TrackingConsent,
  createTrackingConsentState,
  display,
  getCookie,
  resetFetchObservable,
  stopSessionManager,
} from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { HybridInitConfiguration, LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import type { Logger } from '../domain/logger'
import { StatusType } from '../domain/logger/isAuthorized'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import type { Strategy } from './logsPublicApi'
import { createPreStartStrategy } from './preStartLogs'
import type { StartLogsResult } from './startLogs'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = {} as LogsInitConfiguration

describe('preStartLogs', () => {
  let doStartLogsSpy: jasmine.Spy<
    (
      initConfiguration: LogsInitConfiguration,
      configuration: LogsConfiguration,
      sessionManager: LogsSessionManager
    ) => StartLogsResult
  >
  let handleLogSpy: jasmine.Spy<StartLogsResult['handleLog']>
  let getCommonContextSpy: jasmine.Spy<() => CommonContext>
  let strategy: Strategy
  let clock: Clock

  function getLoggedMessage(index: number) {
    const [message, logger, handlingStack, savedCommonContext, savedDate] = handleLogSpy.calls.argsFor(index)
    return { message, logger, handlingStack, savedCommonContext, savedDate }
  }

  beforeEach(() => {
    handleLogSpy = jasmine.createSpy()
    doStartLogsSpy = jasmine.createSpy().and.returnValue({
      handleLog: handleLogSpy,
    } as unknown as StartLogsResult)
    getCommonContextSpy = jasmine.createSpy()
    strategy = createPreStartStrategy(getCommonContextSpy, createTrackingConsentState(), doStartLogsSpy)
  })

  afterEach(() => {
    resetFetchObservable()
    stopSessionManager()
  })

  describe('configuration validation', () => {
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
    })

    it('should start when the configuration is valid', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(displaySpy).not.toHaveBeenCalled()
      await waitFor(() => doStartLogsSpy.calls.count() > 0, { timeout: 2000 })
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
        mockEventBridge()
      })

      it('init should accept empty client token', () => {
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as LogsInitConfiguration)

        expect(displaySpy).not.toHaveBeenCalled()
        expect(doStartLogsSpy).toHaveBeenCalled()
      })
    })
  })

  it('allows sending logs', async () => {
    strategy.handleLog(
      {
        status: StatusType.info,
        message: 'message',
      },
      {} as Logger
    )

    expect(handleLogSpy).not.toHaveBeenCalled()
    strategy.init(DEFAULT_INIT_CONFIGURATION)
    await waitFor(() => handleLogSpy.calls.count() > 0, { timeout: 2000 })

    expect(handleLogSpy.calls.all().length).toBe(1)
    expect(getLoggedMessage(0).message.message).toBe('message')
  })

  it('returns undefined initial configuration', () => {
    expect(strategy.initConfiguration).toBeUndefined()
  })

  describe('save context when submitting a log', () => {
    it('saves the date', () => {
      mockEventBridge()
      clock = mockClock()
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      clock.tick(ONE_SECOND)
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(handleLogSpy.calls.count()).toBe(1)
      expect(getLoggedMessage(0).savedDate).toEqual((Date.now() - ONE_SECOND) as TimeStamp)
    })

    it('saves the URL', async () => {
      getCommonContextSpy.and.returnValue({ view: { url: 'url' } } as unknown as CommonContext)
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      await waitFor(() => handleLogSpy.calls.count() > 0, { timeout: 2000 })
      expect(getLoggedMessage(0).savedCommonContext!.view?.url).toEqual('url')
    })

    it('saves the log context', async () => {
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
      await waitFor(() => handleLogSpy.calls.count() > 0, { timeout: 2000 })

      expect(getLoggedMessage(0).message.context!.foo).toEqual('bar')
    })
  })

  describe('internal context', () => {
    it('should return undefined if not initialized', () => {
      const strategy = createPreStartStrategy(getCommonContextSpy, createTrackingConsentState(), doStartLogsSpy)
      expect(strategy.getInternalContext()).toBeUndefined()
    })
  })

  describe('tracking consent', () => {
    let strategy: Strategy
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      strategy = createPreStartStrategy(getCommonContextSpy, trackingConsentState, doStartLogsSpy)
    })

    describe('basic methods instrumentation', () => {
      it('should instrument fetch even if tracking consent is not granted', () => {
        expect(
          callbackAddsInstrumentation(() => {
            strategy.init({
              ...DEFAULT_INIT_CONFIGURATION,
              trackingConsent: TrackingConsent.NOT_GRANTED,
            })
          })
            .toMethod(window, 'fetch')
            .whenCalled()
        ).toBeTrue()
      })
    })

    it('does not start logs if tracking consent is not granted at init', () => {
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.NOT_GRANTED,
      })
      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })

    it('starts logs if tracking consent is granted before init', async () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.NOT_GRANTED,
      })
      await waitFor(() => doStartLogsSpy.calls.count() > 0, { timeout: 2000 })
      expect(doStartLogsSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start logs if tracking consent is not withdrawn before init', () => {
      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.GRANTED,
      })
      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })

    it('do not call startLogs when tracking consent state is updated after init', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      await waitFor(() => doStartLogsSpy.calls.count() > 0, { timeout: 2000 })
      doStartLogsSpy.calls.reset()

      trackingConsentState.update(TrackingConsent.GRANTED)
      await waitNextMicrotask()

      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present (rate 0)', () => {
      mockEventBridge()

      strategy.init({ ...DEFAULT_INIT_CONFIGURATION, sessionSampleRate: 0 })
      const sessionManager = doStartLogsSpy.calls.mostRecent().args[2]
      expect(sessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should be applied when event bridge is present (rate 100)', () => {
      mockEventBridge()

      strategy.init({ ...DEFAULT_INIT_CONFIGURATION, sessionSampleRate: 100 })
      const sessionManager = doStartLogsSpy.calls.mostRecent().args[2]
      expect(sessionManager.findTrackedSession()).toBeTruthy()
    })
  })

  describe('logs session creation', () => {
    it('creates a session on normal conditions', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      await waitFor(() => getCookie(SESSION_STORE_KEY) !== undefined, { timeout: 2000 })
      expect(getCookie(SESSION_STORE_KEY)).toBeDefined()
    })

    it('does not create a session if event bridge is present', () => {
      mockEventBridge()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })

    it('does not create a session if synthetics worker will inject RUM', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })
  })
})
