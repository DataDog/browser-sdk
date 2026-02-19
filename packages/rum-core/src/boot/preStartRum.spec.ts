import {
  type DeflateWorker,
  type Duration,
  type TimeStamp,
  type TrackingConsentState,
  display,
  getTimeStamp,
  noop,
  relativeToClocks,
  clocksNow,
  TrackingConsent,
  createTrackingConsentState,
  DefaultPrivacyLevel,
  ExperimentalFeature,
  startTelemetry,
  addExperimentalFeatures,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  callbackAddsInstrumentation,
  collectAsyncCalls,
  interceptRequests,
  mockClock,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  createFakeTelemetryObject,
  replaceMockable,
  replaceMockableWithSpy,
} from '@datadog/browser-core/test'
import type { HybridInitConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { RumPlugin } from '../domain/plugins'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
import type { ManualAction } from '../domain/action/trackManualActions'
import { createRumStartSessionManagerMock } from '../../test'
import { startRumSessionManager } from '../domain/rumSessionManager'
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
    let doStartRumSpy: jasmine.Spy<DoStartRum>
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
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

      it('should initialize even if session cannot be handled', () => {
        mockEventBridge()
        spyOnProperty(document, 'cookie', 'get').and.returnValue('')
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        expect(doStartRumSpy).toHaveBeenCalled()
      })
    })
  })

  describe('init', () => {
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
      let startDeflateWorkerSpy: jasmine.Spy
      let doStartRumSpy: jasmine.Spy<DoStartRum>

      beforeEach(() => {
        startDeflateWorkerSpy = jasmine.createSpy().and.returnValue(FAKE_WORKER)
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
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[2]
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
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[2]
          expect(worker).toBeDefined()
        })

        it('aborts the initialization if it fails to create a deflate worker', () => {
          startDeflateWorkerSpy.and.returnValue(undefined)

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )

          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('if message bridge is present, does not create a deflate worker instance', () => {
          mockEventBridge()

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )

          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          expect(doStartRumSpy).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('trackViews mode', () => {
      let clock: Clock | undefined
      let strategy: Strategy
      let doStartRumSpy: jasmine.Spy<DoStartRum>
      let startViewSpy: jasmine.Spy<StartRumResult['startView']>
      let addTimingSpy: jasmine.Spy<StartRumResult['addTiming']>
      let setViewNameSpy: jasmine.Spy<StartRumResult['setViewName']>

      beforeEach(() => {
        startViewSpy = jasmine.createSpy('startView')
        addTimingSpy = jasmine.createSpy('addTiming')
        setViewNameSpy = jasmine.createSpy('setViewName')
        ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults())
        doStartRumSpy.and.returnValue({
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
          expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo' })
          expect(startViewSpy.calls.argsFor(0)[1]).toEqual({
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
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
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
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).toHaveBeenCalledOnceWith({ name: 'bar' }, relativeToClocks(clock.relative(20)))
        })

        it('calling init then startView should start rum', async () => {
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.startView({ name: 'foo' })
          await collectAsyncCalls(doStartRumSpy, 1)
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
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

          expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('first')
          expect(addTimingSpy.calls.argsFor(0)[1]).toEqual(getTimeStamp(clock.relative(10)))

          expect(addTimingSpy.calls.argsFor(1)[0]).toEqual('second')
          expect(addTimingSpy.calls.argsFor(1)[1]).toEqual(getTimeStamp(clock.relative(30)))
        })
      })
    })

    describe('remote configuration', () => {
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
        expect(doStartRumSpy.calls.mostRecent().args[0].sessionSampleRate).toEqual(50)
      })
    })

    describe('plugins', () => {
      it('calls the onInit method on provided plugins', () => {
        const plugin = { name: 'a', onInit: jasmine.createSpy() }
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
        expect(doStartRumSpy.calls.mostRecent().args[0].applicationId).toBe('application-id')
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
      const stopSessionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ stopSession: stopSessionSpy } as unknown as StartRumResult)

      strategy.stopSession()
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(stopSessionSpy).not.toHaveBeenCalled()
    })
  })

  describe('initConfiguration', () => {
    let initConfiguration: RumInitConfiguration
    let interceptor: ReturnType<typeof interceptRequests>

    beforeEach(() => {
      interceptor = interceptRequests()
      initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }
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

    it('returns the initConfiguration with the remote configuration when a remoteConfigurationId is provided', (done) => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
        })
      )
      const { strategy, doStartRumSpy } = createPreStartStrategyWithDefaults()
      doStartRumSpy.and.callFake(() => {
        expect(strategy.initConfiguration?.sessionSampleRate).toEqual(50)
        done()
        return {} as StartRumResult
      })
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          remoteConfigurationId: '123',
        },
        PUBLIC_API
      )
    })
  })

  describe('buffers API calls before starting RUM', () => {
    let strategy: Strategy
    let doStartRumSpy: jasmine.Spy<DoStartRum>

    beforeEach(() => {
      ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults())
    })

    it('addAction', async () => {
      const addActionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addAction: addActionSpy } as unknown as StartRumResult)

      const manualAction: Omit<ManualAction, 'id' | 'duration' | 'counts' | 'frustrationTypes'> = {
        name: 'foo',
        type: ActionType.CUSTOM,
        startClocks: clocksNow(),
      }
      strategy.addAction(manualAction)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addActionSpy, 1)
      expect(addActionSpy).toHaveBeenCalledOnceWith(manualAction)
    })

    it('addError', async () => {
      const addErrorSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addError: addErrorSpy } as unknown as StartRumResult)

      const error = {
        error: new Error('foo'),
        handlingStack: '',
        context: {},
        startClocks: clocksNow(),
      }
      strategy.addError(error)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addErrorSpy, 1)
      expect(addErrorSpy).toHaveBeenCalledOnceWith(error)
    })

    it('startView', async () => {
      const startViewSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ startView: startViewSpy } as unknown as StartRumResult)

      const options = { name: 'foo' }
      const clockState = clocksNow()
      strategy.startView(options, clockState)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(startViewSpy, 1)
      expect(startViewSpy).toHaveBeenCalledOnceWith(options, clockState)
    })

    it('addTiming', async () => {
      const addTimingSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addTiming: addTimingSpy } as unknown as StartRumResult)

      const name = 'foo'
      const time = 123 as TimeStamp
      strategy.addTiming(name, time)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addTimingSpy, 1)
      expect(addTimingSpy).toHaveBeenCalledOnceWith(name, time)
    })

    it('setViewContext', async () => {
      const setViewContextSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewContext: setViewContextSpy } as unknown as StartRumResult)

      strategy.setViewContext({ foo: 'bar' })
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setViewContextSpy, 1)
      expect(setViewContextSpy).toHaveBeenCalledOnceWith({ foo: 'bar' })
    })

    it('setViewContextProperty', async () => {
      const setViewContextPropertySpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewContextProperty: setViewContextPropertySpy } as unknown as StartRumResult)

      strategy.setViewContextProperty('foo', 'bar')
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setViewContextPropertySpy, 1)
      expect(setViewContextPropertySpy).toHaveBeenCalledOnceWith('foo', 'bar')
    })

    it('setViewName', async () => {
      const setViewNameSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewName: setViewNameSpy } as unknown as StartRumResult)

      const name = 'foo'
      strategy.setViewName(name)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(setViewNameSpy, 1)
      expect(setViewNameSpy).toHaveBeenCalledOnceWith(name)
    })

    it('addFeatureFlagEvaluation', async () => {
      const addFeatureFlagEvaluationSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
      } as unknown as StartRumResult)

      const key = 'foo'
      const value = 'bar'
      strategy.addFeatureFlagEvaluation(key, value)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addFeatureFlagEvaluationSpy, 1)
      expect(addFeatureFlagEvaluationSpy).toHaveBeenCalledOnceWith(key, value)
    })

    it('startDurationVital', async () => {
      const addDurationVitalSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addDurationVital: addDurationVitalSpy,
      } as unknown as StartRumResult)

      strategy.startDurationVital('timing')
      strategy.stopDurationVital('timing')

      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addDurationVitalSpy, 1)
      expect(addDurationVitalSpy).toHaveBeenCalled()
    })

    it('addDurationVital', async () => {
      const addDurationVitalSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addDurationVital: addDurationVitalSpy,
      } as unknown as StartRumResult)

      const vitalAdd = { name: 'timing', type: VitalType.DURATION, startClocks: clocksNow(), duration: 100 as Duration }
      strategy.addDurationVital(vitalAdd)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addDurationVitalSpy, 1)
      expect(addDurationVitalSpy).toHaveBeenCalledOnceWith(vitalAdd)
    })

    it('addOperationStepVital', async () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addOperationStepVital: addOperationStepVitalSpy,
      } as unknown as StartRumResult)

      strategy.addOperationStepVital('foo', 'start')
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(addOperationStepVitalSpy, 1)
      expect(addOperationStepVitalSpy).toHaveBeenCalledOnceWith('foo', 'start', undefined, undefined)
    })

    it('startAction / stopAction', () => {
      addExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])

      const startActionSpy = jasmine.createSpy()
      const stopActionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        startAction: startActionSpy,
        stopAction: stopActionSpy,
      } as unknown as StartRumResult)

      strategy.startAction('user_login', { type: ActionType.CUSTOM })
      strategy.stopAction('user_login')

      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await collectAsyncCalls(startActionSpy, 1)

      expect(startActionSpy).toHaveBeenCalledWith(
        'user_login',
        jasmine.objectContaining({
          type: ActionType.CUSTOM,
        }),
        jasmine.objectContaining({
          relative: jasmine.any(Number),
          timeStamp: jasmine.any(Number),
        })
      )
      expect(stopActionSpy).toHaveBeenCalledWith(
        'user_login',
        undefined,
        jasmine.objectContaining({
          relative: jasmine.any(Number),
          timeStamp: jasmine.any(Number),
        })
      )
    })
  })

  describe('tracking consent', () => {
    let strategy: Strategy
    let doStartRumSpy: jasmine.Spy<DoStartRum>
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      ;({ strategy, doStartRumSpy } = createPreStartStrategyWithDefaults({ trackingConsentState }))
    })

    describe('basic methods instrumentation', () => {
      it('should instrument fetch even if tracking consent is not granted', () => {
        expect(
          callbackAddsInstrumentation(() => {
            strategy.init(
              {
                ...DEFAULT_INIT_CONFIGURATION,
                trackingConsent: TrackingConsent.NOT_GRANTED,
              },
              PUBLIC_API
            )
          })
            .toMethod(window, 'fetch')
            .whenCalled()
        ).toBeTrue()
      })
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
      doStartRumSpy.calls.reset()

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
}: {
  rumPublicApiOptions?: RumPublicApiOptions
  trackingConsentState?: TrackingConsentState
} = {}) {
  const doStartRumSpy = jasmine.createSpy<DoStartRum>()
  const startTelemetrySpy = replaceMockableWithSpy(startTelemetry).and.callFake(createFakeTelemetryObject)
  replaceMockable(startRumSessionManager, createRumStartSessionManagerMock())
  return {
    strategy: createPreStartStrategy(
      rumPublicApiOptions,
      trackingConsentState,
      createCustomVitalsState(),
      doStartRumSpy
    ),
    doStartRumSpy,
    startTelemetrySpy,
  }
}
