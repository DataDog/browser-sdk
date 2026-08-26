import { ONE_SECOND } from '@datadog/js-core/time'
import {
  collectAsyncCalls,
  type Clock,
  mockClock,
  mockEventBridge,
  waitNextMicrotask,
  createFakeTelemetryObject,
  replaceMockable,
  replaceMockableWithSpy,
  createStartSessionManagerMock,
} from '@datadog/browser-core/test'
import type { TrackingConsentState } from '@datadog/browser-core'
import {
  TrackingConsent,
  createTrackingConsentState,
  display,
  startTelemetry,
  startSessionManager,
  startWasmModuleTracking,
} from '@datadog/browser-core'
import type { CommonContext } from '../rawLogsEvent.types'
import type { LogsInitConfiguration } from '../domain/configuration'
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

      it('init should accept empty client token', async () => {
        const hybridInitConfiguration: Omit<LogsInitConfiguration, 'clientToken'> = {}
        strategy.init(hybridInitConfiguration as LogsInitConfiguration)

        await collectAsyncCalls(doStartLogsSpy, 1)
        expect(displaySpy).not.toHaveBeenCalled()
        expect(doStartLogsSpy).toHaveBeenCalled()
      })
    })
  })

  it('should not start when session manager initialization fails', async () => {
    const { strategy, doStartLogsSpy, stopWasmModuleTrackingSpy } = createPreStartStrategyWithDefaults({
      startSessionManagerMock: () => Promise.reject(new Error('Session init failed')),
    })
    strategy.init(DEFAULT_INIT_CONFIGURATION)
    await collectAsyncCalls(stopWasmModuleTrackingSpy, 1)
    expect(doStartLogsSpy).not.toHaveBeenCalled()
    expect(stopWasmModuleTrackingSpy).toHaveBeenCalled()
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
    it('saves the date', async () => {
      mockEventBridge()
      const { strategy, getLoggedMessage, handleLogSpy } = createPreStartStrategyWithDefaults()
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      clock.tick(ONE_SECOND)
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(handleLogSpy, 1)

      expect(getLoggedMessage(0).savedDate).toEqual(Date.now() - ONE_SECOND)
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
    let startWasmModuleTrackingSpy: jasmine.Spy
    let stopWasmModuleTrackingSpy: jasmine.Spy
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      ;({ strategy, doStartLogsSpy, startWasmModuleTrackingSpy, stopWasmModuleTrackingSpy } =
        createPreStartStrategyWithDefaults({ trackingConsentState }))
    })

    it('does not start logs if tracking consent is not granted at init', () => {
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.NOT_GRANTED,
      })
      expect(doStartLogsSpy).not.toHaveBeenCalled()
      expect(startWasmModuleTrackingSpy).not.toHaveBeenCalled()
    })

    it('starts logs if tracking consent is granted before init', async () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.NOT_GRANTED,
      })
      await collectAsyncCalls(doStartLogsSpy, 1)
      expect(doStartLogsSpy).toHaveBeenCalledTimes(1)
      expect(doStartLogsSpy.calls.argsFor(0)[3]).toBe(stopWasmModuleTrackingSpy)
    })

    it('does not start logs if tracking consent is not withdrawn before init', () => {
      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.GRANTED,
      })
      expect(doStartLogsSpy).not.toHaveBeenCalled()
      expect(startWasmModuleTrackingSpy).not.toHaveBeenCalled()
    })

    it('starts WebAssembly tracking before the session manager resolves', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(startWasmModuleTrackingSpy).toHaveBeenCalledTimes(1)
      expect(doStartLogsSpy).not.toHaveBeenCalled()

      await collectAsyncCalls(doStartLogsSpy, 1)
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

  describe('telemetry', () => {
    it('starts telemetry during init() by default', async () => {
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(startTelemetrySpy, 1)
      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })

    it('passes the sdk name to telemetry', async () => {
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults({ sdkName: 'logs' })

      strategy.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(startTelemetrySpy, 1)

      expect(startTelemetrySpy.calls.argsFor(0)[3]).toBe('logs')
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
  startSessionManagerMock = createStartSessionManagerMock(),
  sdkName,
}: {
  trackingConsentState?: TrackingConsentState
  startSessionManagerMock?: typeof startSessionManager
  sdkName?: string
} = {}) {
  const handleLogSpy = jasmine.createSpy()
  const doStartLogsSpy = jasmine.createSpy<DoStartLogs>().and.returnValue({
    handleLog: handleLogSpy,
  } as unknown as StartLogsResult)
  const getCommonContextSpy = jasmine.createSpy<() => CommonContext>()
  const startTelemetrySpy = replaceMockableWithSpy(startTelemetry).and.callFake(createFakeTelemetryObject)
  const stopWasmModuleTrackingSpy = jasmine.createSpy()
  const startWasmModuleTrackingSpy =
    replaceMockableWithSpy(startWasmModuleTracking).and.returnValue(stopWasmModuleTrackingSpy)
  replaceMockable(startSessionManager, startSessionManagerMock)

  return {
    strategy: createPreStartStrategy(getCommonContextSpy, trackingConsentState, doStartLogsSpy, sdkName),
    startTelemetrySpy,
    handleLogSpy,
    doStartLogsSpy,
    startWasmModuleTrackingSpy,
    stopWasmModuleTrackingSpy,
    getCommonContextSpy,
    getLoggedMessage: (index: number) => {
      const [message, logger, handlingStack, savedCommonContext, savedDate] = handleLogSpy.calls.argsFor(index)
      return { message, logger, handlingStack, savedCommonContext, savedDate }
    },
  }
}
