import {
  callbackAddsInstrumentation,
  type Clock,
  mockClock,
  mockEventBridge,
  createFakeTelemetryObject,
} from '@datadog/browser-core/test'
import type { TimeStamp, TrackingConsentState } from '@datadog/browser-core'
import { ONE_SECOND, TrackingConsent, createTrackingConsentState, display } from '@datadog/browser-core'
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

  describe('configuration validation', () => {
    let displaySpy: jasmine.Spy
    let doStartLogsSpy: jasmine.Spy<DoStartLogs>
    let strategy: Strategy

    beforeEach(() => {
      ;({ strategy, doStartLogsSpy } = createPreStartStrategyWithDefaults())
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

  it('allows sending logs', () => {
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

    expect(handleLogSpy.calls.all().length).toBe(1)
    expect(getLoggedMessage(0).message.message).toBe('message')
  })

  it('returns undefined initial configuration', () => {
    const { strategy } = createPreStartStrategyWithDefaults()
    expect(strategy.initConfiguration).toBeUndefined()
  })

  describe('save context when submitting a log', () => {
    it('saves the date', () => {
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

    it('saves the URL', () => {
      const { strategy, getLoggedMessage, getCommonContextSpy } = createPreStartStrategyWithDefaults()
      getCommonContextSpy.and.returnValue({ view: { url: 'url' } } as unknown as CommonContext)
      strategy.handleLog(
        {
          status: StatusType.info,
          message: 'message',
        },
        {} as Logger
      )
      strategy.init(DEFAULT_INIT_CONFIGURATION)

      expect(getLoggedMessage(0).savedCommonContext!.view?.url).toEqual('url')
    })

    it('saves the log context', () => {
      const { strategy, getLoggedMessage } = createPreStartStrategyWithDefaults()
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

    it('starts logs if tracking consent is granted before init', () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init({
        ...DEFAULT_INIT_CONFIGURATION,
        trackingConsent: TrackingConsent.NOT_GRANTED,
      })
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

    it('do not call startLogs when tracking consent state is updated after init', () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      doStartLogsSpy.calls.reset()

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartLogsSpy).not.toHaveBeenCalled()
    })
  })

  describe('telemetry', () => {
    it('starts telemetry during init() by default', () => {
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })

    it('does not start telemetry until consent is granted', () => {
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
  const startTelemetrySpy = jasmine.createSpy().and.callFake(createFakeTelemetryObject)

  return {
    strategy: createPreStartStrategy(getCommonContextSpy, trackingConsentState, doStartLogsSpy, startTelemetrySpy),
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
