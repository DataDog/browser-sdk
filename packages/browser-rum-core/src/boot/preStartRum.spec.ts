import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { Duration, TimeStamp } from '@datadog/js-core/time'
import type { DeflateWorker, TrackingConsentState } from '@datadog/browser-core'
import { relativeToClocks, clocksNow, toTimeStamp } from '@datadog/js-core/time'
import {
  display,
  noop,
  TrackingConsent,
  createTrackingConsentState,
  DefaultPrivacyLevel,
  startTelemetry,
  startSessionManager,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  collectAsyncCalls,
  interceptRequests,
  mockClock,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  createFakeTelemetryObject,
  replaceMockable,
  replaceMockableWithSpy,
  createStartSessionManagerMock,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import type { HybridInitConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { RumPlugin } from '../domain/plugins'
import type { ManualAction } from '../domain/action/trackManualActions'
import type { RumPublicApi, RumPublicApiOptions, Strategy } from './rumPublicApi'
import type { StartRumResult } from './startRum'
import type { DoStartRum } from './preStartRum'
import { createPreStartStrategy } from './preStartRum'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = { clientToken: 'yes' } as RumInitConfiguration
const AUTO_CONFIGURATION = { ...DEFAULT_INIT_CONFIGURATION }
const MANUAL_CONFIGURATION = { ...AUTO_CONFIGURATION, trackViewsManually: true }
const FAKE_WORKER = {} as DeflateWorker
const PUBLIC_API = {} as RumPublicApi

describe('preStartRum', () => {
  describe('configuration validation', () => {
    let strategy: Strategy
    let doStartRumSpy: Mock<DoStartRum>
    let displaySpy: Mock

    beforeEach(() => {
      displaySpy = vi.spyOn(display, 'error').mockImplementation(() => undefined)
      ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults())
    })

    it('should start when the configuration is valid', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(doStartRumSpy, 1)
      expect(displaySpy).not.toHaveBeenCalled()
      expect(doStartRumSpy).toHaveBeenCalled()
    })

    it('should not start when the configuration is missing', () => {
      ;(strategy.init as () => void)()
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('should not start when the configuration is invalid', () => {
      strategy.init(INVALID_INIT_CONFIGURATION, PUBLIC_API)
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    describe('multiple init', () => {
      it('should log an error if init is called several times', () => {
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        expect(displaySpy).toHaveBeenCalledTimes(0)

        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        expect(displaySpy).toHaveBeenCalledTimes(1)
      })

      it('should not log an error if init is called several times and silentMultipleInit is true', () => {
        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            silentMultipleInit: true,
          },
          PUBLIC_API
        )
        expect(displaySpy).toHaveBeenCalledTimes(0)

        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            silentMultipleInit: true,
          },
          PUBLIC_API
        )
        expect(displaySpy).toHaveBeenCalledTimes(0)
      })
    })

    describe('if event bridge present', () => {
      it('init should accept empty application id and client token', () => {
        mockEventBridge()
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        expect(display.error).not.toHaveBeenCalled()
      })

      it('should force session sample rate to 100', () => {
        mockEventBridge()
        const invalidConfiguration: HybridInitConfiguration = { sessionSampleRate: 50 }
        strategy.init(invalidConfiguration as RumInitConfiguration, PUBLIC_API)
        expect(strategy.initConfiguration?.sessionSampleRate).toEqual(100)
      })

      it('should set the default privacy level received from the bridge if the not provided in the init configuration', () => {
        mockEventBridge({ privacyLevel: DefaultPrivacyLevel.ALLOW })
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        expect((strategy.initConfiguration as RumInitConfiguration)?.defaultPrivacyLevel).toEqual(
          DefaultPrivacyLevel.ALLOW
        )
      })

      it('should set the default privacy level from the init configuration if provided', () => {
        mockEventBridge({ privacyLevel: DefaultPrivacyLevel.ALLOW })
        const hybridInitConfiguration: HybridInitConfiguration = { defaultPrivacyLevel: DefaultPrivacyLevel.MASK }
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        expect((strategy.initConfiguration as RumInitConfiguration)?.defaultPrivacyLevel).toEqual(
          hybridInitConfiguration.defaultPrivacyLevel
        )
      })

      it('should set the default privacy level to "mask" if not provided in init configuration nor the bridge', () => {
        mockEventBridge({ privacyLevel: undefined })
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        expect((strategy.initConfiguration as RumInitConfiguration)?.defaultPrivacyLevel).toEqual(
          DefaultPrivacyLevel.MASK
        )
      })

      it('should initialize even if session cannot be handled', async () => {
        mockEventBridge()
        vi.spyOn(document, 'cookie', 'get').mockReturnValue('')
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await collectAsyncCalls(doStartRumSpy, 1)
        expect(doStartRumSpy).toHaveBeenCalled()
      })
    })
  })

  describe('init', () => {
    it('should not initialize if session cannot be handled and bridge is not present', async () => {
      const displaySpy = vi.spyOn(display, 'warn').mockImplementation(() => undefined)
      const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({
        startSessionManagerMock: () => {
          display.warn('No storage available for session. We will not send any data.')
          return Promise.resolve(null as any)
        },
      })
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(doStartRumSpy, 0)
      expect(doStartRumSpy).not.toHaveBeenCalled()
      expect(displaySpy).toHaveBeenCalled()
    })

    it('should not start when session manager initialization fails', async () => {
      const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({
        startSessionManagerMock: () => Promise.reject(new Error('Session init failed')),
      })
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(doStartRumSpy, 0)
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    describe('skipInitIfSyntheticsWillInjectRum option', () => {
      it('when true, ignores init() call if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({
          rumPublicApiOptions: {
            ignoreInitIfSyntheticsWillInjectRum: true,
          },
        })
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

        expect(doStartRumSpy).not.toHaveBeenCalled()
      })

      it('when undefined, ignores init() call if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

        expect(doStartRumSpy).not.toHaveBeenCalled()
      })

      it('when false, does not ignore init() call even if Synthetics will inject its own instance of RUM', async () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({
          rumPublicApiOptions: {
            ignoreInitIfSyntheticsWillInjectRum: false,
          },
        })
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await collectAsyncCalls(doStartRumSpy, 1)

        expect(doStartRumSpy).toHaveBeenCalled()
      })
    })

    describe('deflate worker', () => {
      let strategy: Strategy
      let startDeflateWorkerSpy: Mock
      let doStartRumSpy: Mock<DoStartRum>

      beforeEach(() => {
        startDeflateWorkerSpy = vi.fn().mockReturnValue(FAKE_WORKER)
        ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({
          rumPublicApiOptions: {
            startDeflateWorker: startDeflateWorkerSpy,
            createDeflateEncoder: noop as any,
          },
        }))
      })

      describe('with compressIntakeRequests: false', () => {
        it('does not create a deflate worker', async () => {
          strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
          await collectAsyncCalls(doStartRumSpy, 1)

          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          const worker: DeflateWorker | undefined = doStartRumSpy.mock.lastCall![2]
          expect(worker).toBeUndefined()
        })
      })

      describe('with compressIntakeRequests: true', () => {
        it('creates a deflate worker instance', async () => {
          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )
          await collectAsyncCalls(doStartRumSpy, 1)

          expect(startDeflateWorkerSpy).toHaveBeenCalledTimes(1)
          const worker: DeflateWorker | undefined = doStartRumSpy.mock.lastCall![2]
          expect(worker).toBeDefined()
        })

        it('aborts the initialization if it fails to create a deflate worker', () => {
          startDeflateWorkerSpy.mockReturnValue(undefined)

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )

          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('if message bridge is present, does not create a deflate worker instance', async () => {
          mockEventBridge()

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )

          await collectAsyncCalls(doStartRumSpy, 1)
          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          expect(doStartRumSpy).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('trackViews mode', () => {
      let clock: Clock | undefined
      let strategy: Strategy
      let doStartRumSpy: Mock<DoStartRum>
      let startViewSpy: Mock<StartRumResult['startView']>
      let addTimingSpy: Mock<StartRumResult['addTiming']>
      let setViewNameSpy: Mock<StartRumResult['setViewName']>

      beforeEach(() => {
        startViewSpy = vi.fn()
        addTimingSpy = vi.fn()
        setViewNameSpy = vi.fn()
        ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults())
        doStartRumSpy.mockReturnValue({
          startView: startViewSpy,
          addTiming: addTimingSpy,
          setViewName: setViewNameSpy,
        } as unknown as StartRumResult)
      })

      describe('when auto', () => {
        it('should start rum at init', async () => {
          strategy.init(AUTO_CONFIGURATION, PUBLIC_API)
          await collectAsyncCalls(doStartRumSpy, 1)

          expect(doStartRumSpy).toHaveBeenCalled()
        })

        it('before init startView should be handled after init', async () => {
          clock = mockClock()

          clock.tick(10)
          strategy.startView({ name: 'foo' })

          expect(startViewSpy).not.toHaveBeenCalled()

          clock.tick(20)
          strategy.init(AUTO_CONFIGURATION, PUBLIC_API)
          await collectAsyncCalls(doStartRumSpy, 1)
          await collectAsyncCalls(startViewSpy, 1)

          expect(startViewSpy).toHaveBeenCalled()
          expect(startViewSpy.mock.calls[0][0]).toEqual({ name: 'foo' })
          expect(startViewSpy.mock.calls[0][1]).toEqual({
            relative: clock.relative(10),
            timeStamp: clock.timeStamp(10),
          })
        })
      })

      describe('when views are tracked manually', () => {
        it('should not start rum at init', () => {
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)

          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('calling startView then init should start rum', async () => {
          strategy.startView({ name: 'foo' })
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          await collectAsyncCalls(doStartRumSpy, 1)
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.mock.calls[0][3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).not.toHaveBeenCalled()
        })

        it('calling startView then init does not start rum if tracking consent is not granted', () => {
          strategy.startView({ name: 'foo' })
          strategy.init(
            {
              ...MANUAL_CONFIGURATION,
              trackingConsent: TrackingConsent.NOT_GRANTED,
            },
            PUBLIC_API
          )
          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('calling startView twice before init should start rum and create a new view', async () => {
          clock = mockClock()
          clock.tick(10)
          strategy.startView({ name: 'foo' })

          clock.tick(10)
          strategy.startView({ name: 'bar' })

          clock.tick(10)
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          await collectAsyncCalls(doStartRumSpy, 1)
          await collectAsyncCalls(startViewSpy, 1)

          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.mock.calls[0][3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).toHaveBeenCalledTimes(1)
          expect(startViewSpy).toHaveBeenCalledExactlyOnceWith({ name: 'bar' }, relativeToClocks(clock.relative(20)))
        })

        it('calling init then startView should start rum', async () => {
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.startView({ name: 'foo' })
          await collectAsyncCalls(doStartRumSpy, 1)
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.mock.calls[0][3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).not.toHaveBeenCalled()
        })

        it('API calls should be handled in order', async () => {
          clock = mockClock()

          clock.tick(10)
          strategy.addTiming('first')

          clock.tick(10)
          strategy.startView({ name: 'foo' })

          clock.tick(10)
          strategy.addTiming('second')

          clock.tick(10)
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          await collectAsyncCalls(doStartRumSpy, 1)
          await collectAsyncCalls(addTimingSpy, 2)

          expect(addTimingSpy).toHaveBeenCalledTimes(2)

          expect(addTimingSpy.mock.calls[0][0]).toEqual('first')
          expect(addTimingSpy.mock.calls[0][1]).toEqual(toTimeStamp(clock.relative(10)))

          expect(addTimingSpy.mock.calls[1][0]).toEqual('second')
          expect(addTimingSpy.mock.calls[1][1]).toEqual(toTimeStamp(clock.relative(30)))
        })
      })
    })

    describe('remote configuration sync loading', () => {
      let interceptor: ReturnType<typeof interceptRequests>

      beforeEach(() => {
        interceptor = interceptRequests()
      })

      it('should start with the remote configuration when a remoteConfigurationId is provided', async () => {
        interceptor.withFetch(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
          })
        )
        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()
        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            remoteConfigurationId: '123',
          },
          PUBLIC_API
        )
        await collectAsyncCalls(doStartRumSpy, 1)
        expect(doStartRumSpy.mock.lastCall![0].sessionSampleRate).toEqual(50)
      })

      it('should start with the remote configuration when remoteConfiguration.sync is true', async () => {
        interceptor.withFetch(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
          })
        )
        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()
        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            remoteConfiguration: { id: '123', sync: true },
          },
          PUBLIC_API
        )
        await collectAsyncCalls(doStartRumSpy, 1)
        expect(doStartRumSpy.mock.lastCall![0].sessionSampleRate).toEqual(50)
      })
    })

    describe('remote configuration async loading', () => {
      const REMOTE_CONFIGURATION_ID = '123'
      let interceptor: ReturnType<typeof interceptRequests>

      beforeEach(() => {
        localStorage.clear()

        interceptor = interceptRequests()
        interceptor.withFetch(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
          })
        )

        registerCleanupTask(() => {
          localStorage.clear()
        })
      })

      it('should start synchronously with init configuration on cache miss', async () => {
        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            remoteConfiguration: { id: REMOTE_CONFIGURATION_ID },
            sessionSampleRate: 25,
          },
          PUBLIC_API
        )

        await collectAsyncCalls(doStartRumSpy, 1)
        expect(doStartRumSpy.mock.lastCall![0].sessionSampleRate).toBe(25)
      })

      it('should trigger a background fetch to the remote configuration endpoint', async () => {
        const { strategy } = createPreStartStrategyWithDefaults()

        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            remoteConfiguration: { id: REMOTE_CONFIGURATION_ID },
          },
          PUBLIC_API
        )

        await interceptor.waitForAllFetchCalls()
        expect(interceptor.requests.some((request) => request.url.includes(REMOTE_CONFIGURATION_ID))).toBe(true)
      })

      describe('with required: true', () => {
        const CACHE_KEY = `dd_rc_${REMOTE_CONFIGURATION_ID}`

        it('should not start the SDK on cache miss', async () => {
          const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              remoteConfiguration: { id: REMOTE_CONFIGURATION_ID, required: true },
            },
            PUBLIC_API
          )

          await interceptor.waitForAllFetchCalls()
          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('should still trigger a background fetch on cache miss', async () => {
          const { strategy } = createPreStartStrategyWithDefaults()

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              remoteConfiguration: { id: REMOTE_CONFIGURATION_ID, required: true },
            },
            PUBLIC_API
          )

          await interceptor.waitForAllFetchCalls()
          expect(interceptor.requests.some((request) => request.url.includes(REMOTE_CONFIGURATION_ID))).toBe(true)
        })

        it('should start the SDK with the cached configuration on cache hit', async () => {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ version: 2, config: { rum: { sessionSampleRate: 75 } }, fetchedAt: 1000 })
          )
          const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              remoteConfiguration: { id: REMOTE_CONFIGURATION_ID, required: true },
            },
            PUBLIC_API
          )

          await collectAsyncCalls(doStartRumSpy, 1)
          expect(doStartRumSpy.mock.lastCall![0].sessionSampleRate).toBe(75)
        })

        it('should not start the SDK on cache error', async () => {
          localStorage.setItem(CACHE_KEY, 'not-json')
          const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              remoteConfiguration: { id: REMOTE_CONFIGURATION_ID, required: true },
            },
            PUBLIC_API
          )

          await interceptor.waitForAllFetchCalls()
          expect(doStartRumSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('plugins', () => {
      it('calls the onInit method on provided plugins', () => {
        const plugin = { name: 'a', onInit: vi.fn() }
        const { strategy } = createPreStartStrategyWithDefaults()
        const initConfiguration: RumInitConfiguration = { ...DEFAULT_INIT_CONFIGURATION, plugins: [plugin] }
        strategy.init(initConfiguration, PUBLIC_API)

        expect(plugin.onInit).toHaveBeenCalledWith({
          initConfiguration,
          publicApi: PUBLIC_API,
        })
      })

      it('plugins can edit the init configuration prior to validation', async () => {
        const plugin: RumPlugin = {
          name: 'a',
          onInit: ({ initConfiguration }) => {
            initConfiguration.clientToken = 'client-token'
            initConfiguration.applicationId = 'application-id'
          },
        }
        const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()
        strategy.init(
          {
            plugins: [plugin],
          } as RumInitConfiguration,
          PUBLIC_API
        )
        await collectAsyncCalls(doStartRumSpy, 1)

        expect(doStartRumSpy).toHaveBeenCalled()
        expect(doStartRumSpy.mock.lastCall![0].applicationId).toBe('application-id')
      })
    })
  })

  describe('getInternalContext', () => {
    it('returns undefined', () => {
      const { strategy } = createPreStartStrategyWithDefaults()
      expect(strategy.getInternalContext()).toBe(undefined)
    })
  })

  describe('getViewContext', () => {
    it('returns empty object', () => {
      const { strategy } = createPreStartStrategyWithDefaults()
      expect(strategy.getViewContext()).toEqual({})
    })
  })

  describe('stopSession', () => {
    it('does not buffer the call before starting RUM', () => {
      const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()
      const stopSessionSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ stopSession: stopSessionSpy } as unknown as StartRumResult)

      strategy.stopSession()
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(stopSessionSpy).not.toHaveBeenCalled()
    })
  })

  describe('initConfiguration', () => {
    let initConfiguration: RumInitConfiguration
    let interceptor: ReturnType<typeof interceptRequests>

    beforeEach(() => {
      localStorage.clear()

      interceptor = interceptRequests()
      initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }

      registerCleanupTask(() => {
        localStorage.clear()
      })
    })

    it('is undefined before init', () => {
      const { strategy } = createPreStartStrategyWithDefaults()
      expect(strategy.initConfiguration).toBe(undefined)
    })

    it('returns the user configuration after init', () => {
      const { strategy } = createPreStartStrategyWithDefaults()
      strategy.init(initConfiguration, PUBLIC_API)

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the user configuration even if skipInitIfSyntheticsWillInjectRum is true', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })

      const { strategy } = createPreStartStrategyWithDefaults({
        rumPublicApiOptions: {
          ignoreInitIfSyntheticsWillInjectRum: true,
        },
      })
      strategy.init(initConfiguration, PUBLIC_API)

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the initConfiguration with the remote configuration when a remoteConfigurationId is provided', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
        })
      )
      const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()

      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          remoteConfigurationId: '123',
        },
        PUBLIC_API
      )

      await collectAsyncCalls(doStartRumSpy, 1)
      expect(doStartRumSpy).toHaveBeenCalledTimes(1)
      expect(strategy.initConfiguration?.sessionSampleRate).toEqual(50)
    })

    it('exposes the user configuration when remoteConfiguration.id is provided', () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
        })
      )

      const { strategy } = createPreStartStrategyWithDefaults()
      const userInitConfiguration: RumInitConfiguration = {
        ...DEFAULT_INIT_CONFIGURATION,
        remoteConfiguration: { id: '123' },
      }
      strategy.init(userInitConfiguration, PUBLIC_API)

      expect(strategy.initConfiguration).toEqual(userInitConfiguration)
    })
  })

  describe('buffers API calls before starting RUM', () => {
    let strategy: Strategy
    let doStartRumSpy: Mock<DoStartRum>

    beforeEach(() => {
      ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults())
    })

    it('addAction', async () => {
      const addActionSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ addAction: addActionSpy } as unknown as StartRumResult)

      const manualAction: Omit<ManualAction, 'id' | 'duration' | 'counts' | 'frustrationTypes'> = {
        name: 'foo',
        type: ActionType.CUSTOM,
        startClocks: clocksNow(),
      }
      strategy.addAction(manualAction)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addActionSpy, 1)
      expect(addActionSpy).toHaveBeenCalledExactlyOnceWith(manualAction)
    })

    it('addError', async () => {
      const addErrorSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ addError: addErrorSpy } as unknown as StartRumResult)

      const error = {
        error: new Error('foo'),
        handlingStack: '',
        context: {},
        startClocks: clocksNow(),
      }
      strategy.addError(error)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addErrorSpy, 1)
      expect(addErrorSpy).toHaveBeenCalledExactlyOnceWith(error)
    })

    it('startView', async () => {
      const startViewSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ startView: startViewSpy } as unknown as StartRumResult)

      const options = { name: 'foo' }
      const clockState = clocksNow()
      strategy.startView(options, clockState)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(startViewSpy, 1)
      expect(startViewSpy).toHaveBeenCalledExactlyOnceWith(options, clockState)
    })

    it('addTiming', async () => {
      const addTimingSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ addTiming: addTimingSpy } as unknown as StartRumResult)

      const name = 'foo'
      const time = 123 as TimeStamp
      strategy.addTiming(name, time)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addTimingSpy, 1)
      expect(addTimingSpy).toHaveBeenCalledExactlyOnceWith(name, time)
    })

    it('setLoadingTime', async () => {
      const setLoadingTimeSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ setLoadingTime: setLoadingTimeSpy } as unknown as StartRumResult)

      const timestamp = 123 as TimeStamp
      strategy.setLoadingTime(timestamp)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setLoadingTimeSpy, 1)
      expect(setLoadingTimeSpy).toHaveBeenCalledExactlyOnceWith(timestamp)
    })

    it('setLoadingTime should preserve call timestamp', async () => {
      const clock = mockClock()
      const setLoadingTimeSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ setLoadingTime: setLoadingTimeSpy } as unknown as StartRumResult)

      clock.tick(10)
      strategy.setLoadingTime(clock.timeStamp(10))

      clock.tick(20)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setLoadingTimeSpy, 1)

      expect(setLoadingTimeSpy).toHaveBeenCalledTimes(1)
      expect(setLoadingTimeSpy).toHaveBeenCalledExactlyOnceWith(expect.any(Number))
      // Verify the timestamp was captured at call time (tick 10), not at drain time (tick 30)
      const capturedTimestamp = setLoadingTimeSpy.mock.calls[0][0] as number
      expect(capturedTimestamp).toBe(clock.timeStamp(10))
    })

    it('setViewContext', async () => {
      const setViewContextSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ setViewContext: setViewContextSpy } as unknown as StartRumResult)

      strategy.setViewContext({ foo: 'bar' })
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setViewContextSpy, 1)
      expect(setViewContextSpy).toHaveBeenCalledExactlyOnceWith({ foo: 'bar' })
    })

    it('setViewContextProperty', async () => {
      const setViewContextPropertySpy = vi.fn()
      doStartRumSpy.mockReturnValue({ setViewContextProperty: setViewContextPropertySpy } as unknown as StartRumResult)

      strategy.setViewContextProperty('foo', 'bar')
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setViewContextPropertySpy, 1)
      expect(setViewContextPropertySpy).toHaveBeenCalledExactlyOnceWith('foo', 'bar')
    })

    it('setViewName', async () => {
      const setViewNameSpy = vi.fn()
      doStartRumSpy.mockReturnValue({ setViewName: setViewNameSpy } as unknown as StartRumResult)

      const name = 'foo'
      strategy.setViewName(name)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setViewNameSpy, 1)
      expect(setViewNameSpy).toHaveBeenCalledExactlyOnceWith(name)
    })

    it('addFeatureFlagEvaluation', async () => {
      const addFeatureFlagEvaluationSpy = vi.fn()
      doStartRumSpy.mockReturnValue({
        addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
      } as unknown as StartRumResult)

      const key = 'foo'
      const value = 'bar'
      strategy.addFeatureFlagEvaluation(key, value)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addFeatureFlagEvaluationSpy, 1)
      expect(addFeatureFlagEvaluationSpy).toHaveBeenCalledExactlyOnceWith(key, value)
    })

    it('startDurationVital', async () => {
      const startDurationVitalSpy = vi.fn()
      const stopDurationVitalSpy = vi.fn()
      doStartRumSpy.mockReturnValue({
        startDurationVital: startDurationVitalSpy,
        stopDurationVital: stopDurationVitalSpy,
      } as unknown as StartRumResult)

      strategy.startDurationVital('timing')
      strategy.stopDurationVital('timing')

      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(stopDurationVitalSpy, 1)
      expect(startDurationVitalSpy).toHaveBeenCalledWith('timing', undefined, expect.any(Object))
      expect(stopDurationVitalSpy).toHaveBeenCalledWith('timing', undefined, expect.any(Object))
    })

    it('addDurationVital', async () => {
      const addDurationVitalSpy = vi.fn()
      doStartRumSpy.mockReturnValue({
        addDurationVital: addDurationVitalSpy,
      } as unknown as StartRumResult)

      const vitalAdd = {
        id: 'id',
        name: 'timing',
        type: VitalType.DURATION,
        startClocks: clocksNow(),
        duration: 100 as Duration,
      }
      strategy.addDurationVital(vitalAdd)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addDurationVitalSpy, 1)
      expect(addDurationVitalSpy).toHaveBeenCalledExactlyOnceWith(vitalAdd)
    })

    it('addOperationStepVital', async () => {
      const addOperationStepVitalSpy = vi.fn()
      doStartRumSpy.mockReturnValue({
        addOperationStepVital: addOperationStepVitalSpy,
      } as unknown as StartRumResult)

      strategy.addOperationStepVital('foo', 'start')
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addOperationStepVitalSpy, 1)
      expect(addOperationStepVitalSpy).toHaveBeenCalledExactlyOnceWith('foo', 'start', undefined, undefined)
    })

    it('startAction / stopAction', async () => {
      const startActionSpy = vi.fn()
      const stopActionSpy = vi.fn()
      doStartRumSpy.mockReturnValue({
        startAction: startActionSpy,
        stopAction: stopActionSpy,
      } as unknown as StartRumResult)

      strategy.startAction('user_login', { type: ActionType.CUSTOM })
      strategy.stopAction('user_login')

      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(startActionSpy, 1)

      expect(startActionSpy).toHaveBeenCalledWith(
        'user_login',
        expect.objectContaining({
          type: ActionType.CUSTOM,
        }),
        expect.objectContaining({
          relative: expect.any(Number),
          timeStamp: expect.any(Number),
        })
      )
      expect(stopActionSpy).toHaveBeenCalledWith(
        'user_login',
        undefined,
        expect.objectContaining({
          relative: expect.any(Number),
          timeStamp: expect.any(Number),
        })
      )
    })
  })

  describe('tracking consent', () => {
    let strategy: Strategy
    let doStartRumSpy: Mock<DoStartRum>
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({ trackingConsentState }))
    })

    it('does not start rum if tracking consent is not granted at init', () => {
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('starts rum if tracking consent is granted before init', async () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )
      await collectAsyncCalls(doStartRumSpy, 1)
      expect(doStartRumSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start rum if tracking consent is withdrawn before init', () => {
      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.GRANTED,
        },
        PUBLIC_API
      )
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('does not start rum if no view is started', () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init(
        {
          ...MANUAL_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('do not call startRum when tracking consent state is updated after init', () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      doStartRumSpy.mockClear()

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartRumSpy).not.toHaveBeenCalled()
    })
  })

  describe('telemetry', () => {
    it('starts telemetry during init() by default', () => {
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults()
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })

    it('does not start telemetry until consent is granted', () => {
      const trackingConsentState = createTrackingConsentState()
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults({
        trackingConsentState,
      })

      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )

      expect(startTelemetrySpy).not.toHaveBeenCalled()

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })

    it('starts telemetry only once', () => {
      const trackingConsentState = createTrackingConsentState()
      const { strategy, startTelemetrySpy } = createPreStartStrategyWithDefaults({
        trackingConsentState,
      })

      strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)

      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)

      strategy.startView({ name: 'foo' })

      expect(startTelemetrySpy).toHaveBeenCalledTimes(1)
    })
  })
})

function createPreStartStrategyWithDefaults({
  rumPublicApiOptions = {},
  trackingConsentState = createTrackingConsentState(),
  startSessionManagerMock = createStartSessionManagerMock(),
}: {
  rumPublicApiOptions?: RumPublicApiOptions
  trackingConsentState?: TrackingConsentState
  startSessionManagerMock?: typeof startSessionManager
} = {}) {
  const doStartRumSpy = vi.fn<DoStartRum>()
  const startTelemetrySpy = replaceMockableWithSpy(startTelemetry).mockImplementation(createFakeTelemetryObject)
  replaceMockable(startSessionManager, startSessionManagerMock)
  return {
    strategy: createPreStartStrategy(rumPublicApiOptions, trackingConsentState, doStartRumSpy),
    doStartRumSpy,
    startTelemetrySpy,
  }
}
