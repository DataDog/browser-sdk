import {
  callbackAddsInstrumentation,
  collectAsyncCalls,
  type Clock,
  mockClock,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  waitNextMicrotask,
  createFakeTelemetryObject,
  replaceMockableWithSpy,
} from '@datadog/browser-core/test'
import type { TimeStamp, TrackingConsentState } from '@datadog/browser-core'
import {
  SESSION_STORE_KEY,
  getCookie,
  stopSessionManager,
  ONE_SECOND,
  TrackingConsent,
  createTrackingConsentState,
  display,
  startTelemetry,
} from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { HybridInitConfiguration, LogsInitConfiguration } from '../domain/configuration'
import type { Logger } from '../domain/logger'
import { StatusType } from '../domain/logger/isAuthorized'
import type { Strategy } from './logsPublicApi'
import type { DoStartLogs } from './preStartLogs'
import { createPreStartStrategy } from './preStartLogs'
import type { StartLogsResult } from './startLogs'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = {} as LogsInitConfiguration

describe('preStartLogs', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    stopSessionManager()
  })

  describe('configuration validation', () => {
    let displaySpy: jasmine.Spy
    let doStartLogsSpy: jasmine.Spy<DoStartLogs>
    let strategy: Strategy

    beforeEach(() => {
      ;({ strategy, doStartLogsSpy } = createPreStartStrategyWithDefaults())
      displaySpy = spyOn(display, 'error')
    })

    it('should start when the configuration is valid', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(displaySpy).not.toHaveBeenCalled()
      await collectAsyncCalls(doStartLogsSpy, 1)
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
    const { strategy, handleLogSpy, getLoggedMessage } = createPreStartStrategyWithDefaults()
    strategy.handleLog(
      {
        status: StatusType.info,
        message: 'message',
      },
      {} as Logger
    )

    expect(handleLogSpy).not.toHaveBeenCalled()
    strategy.init(DEFAULT_INIT_CONFIGURATION)
    await collectAsyncCalls(handleLogSpy, 1)

    expect(handleLogSpy.calls.all().length).toBe(1)
    expect(getLoggedMessage(0).message.message).toBe('message')
  })

  it('returns undefined initial configuration', () => {
    const { strategy } = createPreStartStrategyWithDefaults()
    expect(strategy.initConfiguration).toBeUndefined()
  })

  describe('save context when submitting a log', () => {
    it('saves the date', () => {
      mockEventBridge()
      const { strategy, getLoggedMessage } = createPreStartStrategyWithDefaults()
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

    it('saves the URL', async () => {
      const { strategy, getLoggedMessage, getCommonContextSpy, handleLogSpy } = createPreStartStrategyWithDefaults()
      getCommonContextSpy.and.returnValue({ view: { url: 'url' } } as unknown as CommonContext)
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      await collectAsyncCalls(handleLogSpy, 1)
      expect(getLoggedMessage(0).savedCommonContext!.view?.url).toEqual('url')
    })

    it('saves the log context', async () => {
      const { strategy, getLoggedMessage, handleLogSpy } = createPreStartStrategyWithDefaults()
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
      await collectAsyncCalls(handleLogSpy, 1)

      expect(getLoggedMessage(0).message.context!.foo).toEqual('bar')
    })
  })

  describe('internal context', () => {
    it('should return undefined if not initialized', () => {
      const { strategy } = createPreStartStrategyWithDefaults()
      expect(strategy.getInternalContext()).toBeUndefined()
    })
  })

  describe('tracking consent', () => {
    let strategy: Strategy
    let doStartLogsSpy: jasmine.Spy<DoStartLogs>
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      ;({ strategy, doStartLogsSpy } = createPreStartStrategyWithDefaults({ trackingConsentState }))
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
      await collectAsyncCalls(doStartLogsSpy, 1)
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
      await collectAsyncCalls(doStartLogsSpy, 1)
      doStartLogsSpy.calls.reset()

      trackingConsentState.update(TrackingConsent.GRANTED)
      await waitNextMicrotask()

      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present (rate 0)', async () => {
      mockEventBridge()
      const { strategy, doStartLogsSpy } = createPreStartStrategyWithDefaults()

      strategy.init({ ...DEFAULT_INIT_CONFIGURATION, sessionSampleRate: 0 })
      await collectAsyncCalls(doStartLogsSpy, 1)
      const sessionManager = doStartLogsSpy.calls.mostRecent().args[2]
      expect(sessionManager.findTrackedSession()).toBeUndefined()
    })

    it('should be applied when event bridge is present (rate 100)', async () => {
      mockEventBridge()
      const { strategy, doStartLogsSpy } = createPreStartStrategyWithDefaults()

      strategy.init({ ...DEFAULT_INIT_CONFIGURATION, sessionSampleRate: 100 })
      await collectAsyncCalls(doStartLogsSpy, 1)
      const sessionManager = doStartLogsSpy.calls.mostRecent().args[2]
      expect(sessionManager.findTrackedSession()).toBeTruthy()
    })
  })

  describe('logs session creation', () => {
    it('creates a session on normal conditions', async () => {
      const { strategy, doStartLogsSpy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      await collectAsyncCalls(doStartLogsSpy, 1)
      expect(getCookie(SESSION_STORE_KEY)).toBeDefined()
    })

    it('does not create a session if event bridge is present', () => {
      mockEventBridge()
      const { strategy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })

    it('does not create a session if synthetics worker will inject RUM', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })
      const { strategy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })
  })

  describe('telemetry', () => {
    it('starts telemetry during init() by default', async () => {
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(startTelemetrySpy, 1)
      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })

    it('does not start telemetry until consent is granted', async () => {
      const trackingConsentState = createTrackingConsentState()
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults({
        trackingConsentState,
      })

      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.NOT_GRANTED,
      })

      expect(startTelemetrySpy).not.toHaveBeenCalled()

      trackingConsentState.update(TrackingConsent.GRANTED)
      await collectAsyncCalls(startTelemetrySpy, 1)

      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })
  })
})

function createPreStartStrategyWithDefaults({
  trackingConsentState = createTrackingConsentState(),
}: {
  trackingConsentState?: TrackingConsentState
} = {}) {
  const handleLogSpy = jasmine.createSpy()
  const doStartLogsSpy = jasmine.createSpy<DoStartLogs>().and.returnValue({
    handleLog: handleLogSpy,
  } as unknown as StartLogsResult)
  const getCommonContextSpy = jasmine.createSpy<() => CommonContext>()
  const startTelemetrySpy = replaceMockableWithSpy(startTelemetry).and.callFake(createFakeTelemetryObject)

  return {
    strategy: createPreStartStrategy(getCommonContextSpy, trackingConsentState, doStartLogsSpy),
    startTelemetrySpy,
    handleLogSpy,
    doStartLogsSpy,
    getCommonContextSpy,
    getLoggedMessage: (index: number) => {
      const [message, logger, handlingStack, savedCommonContext, savedDate] = handleLogSpy.calls.argsFor(index)
      return { message, logger, handlingStack, savedCommonContext, savedDate }
    },
  }
}
