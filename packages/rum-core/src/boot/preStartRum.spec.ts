import type { DeflateWorker, Duration, TimeStamp, TrackingConsentState } from '@datadog/browser-core'
import {
  display,
  getTimeStamp,
  noop,
  relativeToClocks,
  clocksNow,
  TrackingConsent,
  createTrackingConsentState,
  DefaultPrivacyLevel,
  resetExperimentalFeatures,
  resetFetchObservable,
  stopSessionManager,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  callbackAddsInstrumentation,
  interceptRequests,
  mockClock,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  waitSessionOperations,
} from '@datadog/browser-core/test'
import type { HybridInitConfiguration, RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { CustomAction } from '../domain/action/actionCollection'
import type { RumPlugin } from '../domain/plugins'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { RumPublicApi, Strategy } from './rumPublicApi'
import type { StartRumResult } from './startRum'
import { createPreStartStrategy } from './preStartRum'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = { clientToken: 'yes' } as RumInitConfiguration
const AUTO_CONFIGURATION = { ...DEFAULT_INIT_CONFIGURATION }
const MANUAL_CONFIGURATION = { ...AUTO_CONFIGURATION, trackViewsManually: true }
const FAKE_WORKER = {} as DeflateWorker
const PUBLIC_API = {} as RumPublicApi

describe('preStartRum', () => {
  let doStartRumSpy: jasmine.Spy<
    (
      configuration: RumConfiguration,
      sessionManager: RumSessionManager,
      deflateWorker: DeflateWorker | undefined,
      initialViewOptions?: ViewOptions
    ) => StartRumResult
  >

  beforeEach(() => {
    doStartRumSpy = jasmine.createSpy()
  })

  afterEach(() => {
    resetFetchObservable()
    stopSessionManager()
  })

  describe('configuration validation', () => {
    let strategy: Strategy
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      strategy = createPreStartStrategy({}, createTrackingConsentState(), createCustomVitalsState(), doStartRumSpy)
    })

    it('should start when the configuration is valid', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(displaySpy).not.toHaveBeenCalled()
      expect(doStartRumSpy).toHaveBeenCalled()
    })

    it('should not start when the configuration is missing', () => {
      ;(strategy.init as () => void)()
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('should not start when the configuration is invalid', async () => {
      strategy.init(INVALID_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    describe('multiple init', () => {
      it('should log an error if init is called several times', async () => {
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await waitSessionOperations()
        expect(displaySpy).toHaveBeenCalledTimes(0)

        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await waitSessionOperations()
        expect(displaySpy).toHaveBeenCalledTimes(1)
      })

      it('should not log an error if init is called several times and silentMultipleInit is true', async () => {
        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            silentMultipleInit: true,
          },
          PUBLIC_API
        )
        await waitSessionOperations()
        expect(displaySpy).toHaveBeenCalledTimes(0)

        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            silentMultipleInit: true,
          },
          PUBLIC_API
        )
        await waitSessionOperations()
        expect(displaySpy).toHaveBeenCalledTimes(0)
      })
    })

    describe('if event bridge present', () => {
      it('init should accept empty application id and client token', async () => {
        mockEventBridge()
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        await waitSessionOperations()
        expect(display.error).not.toHaveBeenCalled()
      })

      it('should force session sample rate to 100', async () => {
        mockEventBridge()
        const invalidConfiguration: HybridInitConfiguration = { sessionSampleRate: 50 }
        strategy.init(invalidConfiguration as RumInitConfiguration, PUBLIC_API)
        await waitSessionOperations()
        expect(strategy.initConfiguration?.sessionSampleRate).toEqual(100)
      })

      it('should set the default privacy level received from the bridge if the not provided in the init configuration', async () => {
        mockEventBridge({ privacyLevel: DefaultPrivacyLevel.ALLOW })
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        await waitSessionOperations()
        expect((strategy.initConfiguration as RumInitConfiguration)?.defaultPrivacyLevel).toEqual(
          DefaultPrivacyLevel.ALLOW
        )
      })

      it('should set the default privacy level from the init configuration if provided', async () => {
        mockEventBridge({ privacyLevel: DefaultPrivacyLevel.ALLOW })
        const hybridInitConfiguration: HybridInitConfiguration = { defaultPrivacyLevel: DefaultPrivacyLevel.MASK }
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        await waitSessionOperations()
        expect((strategy.initConfiguration as RumInitConfiguration)?.defaultPrivacyLevel).toEqual(
          hybridInitConfiguration.defaultPrivacyLevel
        )
      })

      it('should set the default privacy level to "mask" if not provided in init configuration nor the bridge', async () => {
        mockEventBridge({ privacyLevel: undefined })
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration, PUBLIC_API)
        await waitSessionOperations()
        expect((strategy.initConfiguration as RumInitConfiguration)?.defaultPrivacyLevel).toEqual(
          DefaultPrivacyLevel.MASK
        )
      })

      it('should initialize even if session cannot be handled', async () => {
        mockEventBridge()
        spyOnProperty(document, 'cookie', 'get').and.returnValue('')
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await waitSessionOperations()
        expect(doStartRumSpy).toHaveBeenCalled()
      })
    })
  })

  describe('init', () => {
    it('should not initialize if session cannot be handled and bridge is not present', async () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const displaySpy = spyOn(display, 'warn')
      const strategy = createPreStartStrategy(
        {},
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(doStartRumSpy).not.toHaveBeenCalled()
      expect(displaySpy).toHaveBeenCalled()
    })

    describe('skipInitIfSyntheticsWillInjectRum option', () => {
      it('when true, ignores init() call if Synthetics will inject its own instance of RUM', async () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const strategy = createPreStartStrategy(
          {
            ignoreInitIfSyntheticsWillInjectRum: true,
          },
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await waitSessionOperations()

        expect(doStartRumSpy).not.toHaveBeenCalled()
      })

      it('when undefined, ignores init() call if Synthetics will inject its own instance of RUM', async () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const strategy = createPreStartStrategy(
          {},
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await waitSessionOperations()

        expect(doStartRumSpy).not.toHaveBeenCalled()
      })

      it('when false, does not ignore init() call even if Synthetics will inject its own instance of RUM', async () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const strategy = createPreStartStrategy(
          {
            ignoreInitIfSyntheticsWillInjectRum: false,
          },
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
        await waitSessionOperations()

        expect(doStartRumSpy).toHaveBeenCalled()
      })
    })

    describe('deflate worker', () => {
      let strategy: Strategy
      let startDeflateWorkerSpy: jasmine.Spy

      beforeEach(() => {
        startDeflateWorkerSpy = jasmine.createSpy().and.returnValue(FAKE_WORKER)

        strategy = createPreStartStrategy(
          {
            startDeflateWorker: startDeflateWorkerSpy,
            createDeflateEncoder: noop as any,
          },
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
      })

      describe('with compressIntakeRequests: false', () => {
        it('does not create a deflate worker', async () => {
          strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
          await waitSessionOperations()

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
          await waitSessionOperations()

          expect(startDeflateWorkerSpy).toHaveBeenCalledTimes(1)
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[2]
          expect(worker).toBeDefined()
        })

        it('aborts the initialization if it fails to create a deflate worker', async () => {
          startDeflateWorkerSpy.and.returnValue(undefined)

          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )
          await waitSessionOperations()

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
          await waitSessionOperations()

          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          expect(doStartRumSpy).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('trackViews mode', () => {
      let clock: Clock | undefined
      let strategy: Strategy
      let startViewSpy: jasmine.Spy<StartRumResult['startView']>
      let addTimingSpy: jasmine.Spy<StartRumResult['addTiming']>
      let setViewNameSpy: jasmine.Spy<StartRumResult['setViewName']>

      beforeEach(() => {
        startViewSpy = jasmine.createSpy('startView')
        addTimingSpy = jasmine.createSpy('addTiming')
        setViewNameSpy = jasmine.createSpy('setViewName')
        doStartRumSpy.and.returnValue({
          startView: startViewSpy,
          addTiming: addTimingSpy,
          setViewName: setViewNameSpy,
        } as unknown as StartRumResult)
        strategy = createPreStartStrategy({}, createTrackingConsentState(), createCustomVitalsState(), doStartRumSpy)
      })

      describe('when auto', () => {
        it('should start rum at init', async () => {
          strategy.init(AUTO_CONFIGURATION, PUBLIC_API)
          await waitSessionOperations()

          expect(doStartRumSpy).toHaveBeenCalled()
        })

        it('before init startView should be handled after init', async () => {
          clock = mockClock()

          clock.tick(10)
          strategy.startView({ name: 'foo' })

          expect(startViewSpy).not.toHaveBeenCalled()

          clock.tick(20)
          strategy.init(AUTO_CONFIGURATION, PUBLIC_API)
          await waitSessionOperations()

          expect(startViewSpy).toHaveBeenCalled()
          expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo' })
          expect(startViewSpy.calls.argsFor(0)[1]).toEqual({
            relative: clock.relative(10),
            timeStamp: clock.timeStamp(10),
          })
        })
      })

      describe('when views are tracked manually', () => {
        it('should not start rum at init', async () => {
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          await waitSessionOperations()

          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('calling startView then init should start rum', async () => {
          strategy.startView({ name: 'foo' })
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          await waitSessionOperations()
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).not.toHaveBeenCalled()
        })

        it('calling startView then init does not start rum if tracking consent is not granted', async () => {
          const strategy = createPreStartStrategy(
            {},
            createTrackingConsentState(),
            createCustomVitalsState(),
            doStartRumSpy
          )
          strategy.startView({ name: 'foo' })
          strategy.init(
            {
              ...MANUAL_CONFIGURATION,
              trackingConsent: TrackingConsent.NOT_GRANTED,
            },
            PUBLIC_API
          )
          await waitSessionOperations()
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
          await waitSessionOperations()

          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).toHaveBeenCalledOnceWith({ name: 'bar' }, relativeToClocks(clock.relative(20)))
        })

        it('calling init then startView should start rum', async () => {
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          await waitSessionOperations()
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.startView({ name: 'foo' })
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
          await waitSessionOperations()

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

      it('should start with the remote configuration when a remoteConfigurationId is provided', (done) => {
        // TODO
        interceptor.withFetch(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
          })
        )
        const strategy = createPreStartStrategy(
          {},
          createTrackingConsentState(),
          createCustomVitalsState(),
          (configuration) => {
            expect(configuration.sessionSampleRate).toEqual(50)
            done()
            return {} as StartRumResult
          }
        )
        strategy.init(
          {
            ...DEFAULT_INIT_CONFIGURATION,
            remoteConfigurationId: '123',
          },
          PUBLIC_API
        )
      })
    })

    describe('plugins', () => {
      it('calls the onInit method on provided plugins', async () => {
        const plugin = { name: 'a', onInit: jasmine.createSpy() }
        const strategy = createPreStartStrategy(
          {},
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        const initConfiguration: RumInitConfiguration = { ...DEFAULT_INIT_CONFIGURATION, plugins: [plugin] }
        strategy.init(initConfiguration, PUBLIC_API)
        await waitSessionOperations()

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
        const strategy = createPreStartStrategy(
          {},
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        strategy.init(
          {
            plugins: [plugin],
          } as RumInitConfiguration,
          PUBLIC_API
        )
        await waitSessionOperations()

        expect(doStartRumSpy).toHaveBeenCalled()
        expect(doStartRumSpy.calls.mostRecent().args[0].applicationId).toBe('application-id')
      })
    })
  })

  describe('getInternalContext', () => {
    it('returns undefined', () => {
      const strategy = createPreStartStrategy(
        {},
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      expect(strategy.getInternalContext()).toBe(undefined)
    })
  })

  describe('getViewContext', () => {
    it('returns empty object', () => {
      const strategy = createPreStartStrategy(
        {},
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      expect(strategy.getViewContext()).toEqual({})
    })
  })

  describe('stopSession', () => {
    it('does not buffer the call before starting RUM', async () => {
      const strategy = createPreStartStrategy(
        {},
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      const stopSessionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ stopSession: stopSessionSpy } as unknown as StartRumResult)

      strategy.stopSession()
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(stopSessionSpy).not.toHaveBeenCalled()
    })
  })

  describe('initConfiguration', () => {
    let strategy: Strategy
    let initConfiguration: RumInitConfiguration
    let interceptor: ReturnType<typeof interceptRequests>

    beforeEach(() => {
      interceptor = interceptRequests()
      strategy = createPreStartStrategy({}, createTrackingConsentState(), createCustomVitalsState(), doStartRumSpy)
      initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('is undefined before init', () => {
      expect(strategy.initConfiguration).toBe(undefined)
    })

    it('returns the user configuration after init', async () => {
      strategy.init(initConfiguration, PUBLIC_API)
      await waitSessionOperations()

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the user configuration even if skipInitIfSyntheticsWillInjectRum is true', async () => {
      mockSyntheticsWorkerValues({ injectsRum: true })

      const strategy = createPreStartStrategy(
        {
          ignoreInitIfSyntheticsWillInjectRum: true,
        },
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      strategy.init(initConfiguration, PUBLIC_API)
      await waitSessionOperations()

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the initConfiguration with the remote configuration when a remoteConfigurationId is provided', (done) => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rum: { sessionSampleRate: 50 } }),
        })
      )
      const strategy = createPreStartStrategy({}, createTrackingConsentState(), createCustomVitalsState(), () => {
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

    beforeEach(() => {
      strategy = createPreStartStrategy({}, createTrackingConsentState(), createCustomVitalsState(), doStartRumSpy)
    })

    it('addAction', async () => {
      const addActionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addAction: addActionSpy } as unknown as StartRumResult)

      const customAction: CustomAction = {
        name: 'foo',
        type: ActionType.CUSTOM,
        startClocks: clocksNow(),
      }
      strategy.addAction(customAction)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(addActionSpy).toHaveBeenCalledOnceWith(customAction)
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
      await waitSessionOperations()
      expect(addErrorSpy).toHaveBeenCalledOnceWith(error)
    })

    it('startView', async () => {
      const startViewSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ startView: startViewSpy } as unknown as StartRumResult)

      const options = { name: 'foo' }
      const clockState = clocksNow()
      strategy.startView(options, clockState)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(startViewSpy).toHaveBeenCalledOnceWith(options, clockState)
    })

    it('addTiming', async () => {
      const addTimingSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addTiming: addTimingSpy } as unknown as StartRumResult)

      const name = 'foo'
      const time = 123 as TimeStamp
      strategy.addTiming(name, time)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(addTimingSpy).toHaveBeenCalledOnceWith(name, time)
    })

    it('setViewContext', async () => {
      const setViewContextSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewContext: setViewContextSpy } as unknown as StartRumResult)

      strategy.setViewContext({ foo: 'bar' })
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(setViewContextSpy).toHaveBeenCalledOnceWith({ foo: 'bar' })
    })

    it('setViewContextProperty', async () => {
      const setViewContextPropertySpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewContextProperty: setViewContextPropertySpy } as unknown as StartRumResult)

      strategy.setViewContextProperty('foo', 'bar')
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      expect(setViewContextPropertySpy).toHaveBeenCalledOnceWith('foo', 'bar')
    })

    it('setViewName', async () => {
      const setViewNameSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewName: setViewNameSpy } as unknown as StartRumResult)

      const name = 'foo'
      strategy.setViewName(name)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
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
      await waitSessionOperations()
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
      await waitSessionOperations()
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
      await waitSessionOperations()
      expect(addDurationVitalSpy).toHaveBeenCalledOnceWith(vitalAdd)
    })
  })

  describe('tracking consent', () => {
    let strategy: Strategy
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      strategy = createPreStartStrategy({}, trackingConsentState, createCustomVitalsState(), doStartRumSpy)
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

    it('does not start rum if tracking consent is not granted at init', async () => {
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )
      await waitSessionOperations()
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
      await waitSessionOperations()
      expect(doStartRumSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start rum if tracking consent is withdrawn before init', async () => {
      trackingConsentState.update(TrackingConsent.NOT_GRANTED)
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.GRANTED,
        },
        PUBLIC_API
      )
      await waitSessionOperations()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('does not start rum if no view is started', async () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init(
        {
          ...MANUAL_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )
      await waitSessionOperations()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('do not call startRum when tracking consent state is updated after init', async () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      await waitSessionOperations()
      doStartRumSpy.calls.reset()

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartRumSpy).not.toHaveBeenCalled()
    })
  })
})
