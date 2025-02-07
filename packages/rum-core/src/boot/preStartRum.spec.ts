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
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  callbackAddsInstrumentation,
  interceptRequests,
  mockClock,
  mockEventBridge,
  mockSyntheticsWorkerValues,
} from '@datadog/browser-core/test'
import type { HybridInitConfiguration, RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { CommonContext } from '../domain/contexts/commonContext'
import type { ViewOptions } from '../domain/view/trackViews'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { CustomAction } from '../domain/action/actionCollection'
import type { RumPlugin } from '../domain/plugins'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
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
      deflateWorker: DeflateWorker | undefined,
      initialViewOptions?: ViewOptions
    ) => StartRumResult
  >
  let getCommonContextSpy: jasmine.Spy<() => CommonContext>

  beforeEach(() => {
    doStartRumSpy = jasmine.createSpy()
    getCommonContextSpy = jasmine.createSpy()
  })

  afterEach(() => {
    resetFetchObservable()
  })

  describe('configuration validation', () => {
    let strategy: Strategy
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
    })

    it('should start when the configuration is valid', () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
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
    it('should not initialize if session cannot be handled and bridge is not present', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const displaySpy = spyOn(display, 'warn')
      const strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(doStartRumSpy).not.toHaveBeenCalled()
      expect(displaySpy).toHaveBeenCalled()
    })

    describe('skipInitIfSyntheticsWillInjectRum option', () => {
      it('when true, ignores init() call if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const strategy = createPreStartStrategy(
          {
            ignoreInitIfSyntheticsWillInjectRum: true,
          },
          getCommonContextSpy,
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

        expect(doStartRumSpy).not.toHaveBeenCalled()
      })

      it('when false, does not ignore init() call even if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const strategy = createPreStartStrategy(
          {
            ignoreInitIfSyntheticsWillInjectRum: false,
          },
          getCommonContextSpy,
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

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
          getCommonContextSpy,
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
      })

      describe('with compressIntakeRequests: false', () => {
        it('does not create a deflate worker', () => {
          strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)

          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[1]
          expect(worker).toBeUndefined()
        })
      })

      describe('with compressIntakeRequests: true', () => {
        it('creates a deflate worker instance', () => {
          strategy.init(
            {
              ...DEFAULT_INIT_CONFIGURATION,
              compressIntakeRequests: true,
            },
            PUBLIC_API
          )

          expect(startDeflateWorkerSpy).toHaveBeenCalledTimes(1)
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[1]
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
        strategy = createPreStartStrategy(
          {},
          getCommonContextSpy,
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
      })

      afterEach(() => {
        if (clock) {
          clock.cleanup()
        }
      })

      describe('when auto', () => {
        it('should start rum at init', () => {
          strategy.init(AUTO_CONFIGURATION, PUBLIC_API)

          expect(doStartRumSpy).toHaveBeenCalled()
        })

        it('before init startView should be handled after init', () => {
          clock = mockClock()

          clock.tick(10)
          strategy.startView({ name: 'foo' })

          expect(startViewSpy).not.toHaveBeenCalled()

          clock.tick(20)
          strategy.init(AUTO_CONFIGURATION, PUBLIC_API)

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

        it('calling startView then init should start rum', () => {
          strategy.startView({ name: 'foo' })
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[2]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).not.toHaveBeenCalled()
        })

        it('calling startView then init does not start rum if tracking consent is not granted', () => {
          const strategy = createPreStartStrategy(
            {},
            getCommonContextSpy,
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
          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('calling startView twice before init should start rum and create a new view', () => {
          clock = mockClock()
          clock.tick(10)
          strategy.startView({ name: 'foo' })

          clock.tick(10)
          strategy.startView({ name: 'bar' })

          clock.tick(10)
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)

          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[2]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).toHaveBeenCalledOnceWith({ name: 'bar' }, relativeToClocks(clock.relative(20)))
        })

        it('calling init then startView should start rum', () => {
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.startView({ name: 'foo' })
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[2]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).not.toHaveBeenCalled()
        })

        it('API calls should be handled in order', () => {
          clock = mockClock()

          clock.tick(10)
          strategy.addTiming('first')

          clock.tick(10)
          strategy.startView({ name: 'foo' })

          clock.tick(10)
          strategy.addTiming('second')

          clock.tick(10)
          strategy.init(MANUAL_CONFIGURATION, PUBLIC_API)

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
        interceptor.withMockXhr((xhr) => {
          xhr.complete(200, '{"rum":{"sessionSampleRate":50}}')

          expect(doStartRumSpy.calls.mostRecent().args[0].sessionSampleRate).toEqual(50)
          done()
        })

        const strategy = createPreStartStrategy(
          {},
          getCommonContextSpy,
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
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
      it('calls the onInit method on provided plugins', () => {
        const plugin = { name: 'a', onInit: jasmine.createSpy() }
        const strategy = createPreStartStrategy(
          {},
          getCommonContextSpy,
          createTrackingConsentState(),
          createCustomVitalsState(),
          doStartRumSpy
        )
        const initConfiguration: RumInitConfiguration = { ...DEFAULT_INIT_CONFIGURATION, plugins: [plugin] }
        strategy.init(initConfiguration, PUBLIC_API)

        expect(plugin.onInit).toHaveBeenCalledWith({
          initConfiguration,
          publicApi: PUBLIC_API,
        })
      })

      it('plugins can edit the init configuration prior to validation', () => {
        const plugin: RumPlugin = {
          name: 'a',
          onInit: ({ initConfiguration }) => {
            initConfiguration.clientToken = 'client-token'
            initConfiguration.applicationId = 'application-id'
          },
        }
        const strategy = createPreStartStrategy(
          {},
          getCommonContextSpy,
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

        expect(doStartRumSpy).toHaveBeenCalled()
        expect(doStartRumSpy.calls.mostRecent().args[0].applicationId).toBe('application-id')
      })
    })
  })

  describe('getInternalContext', () => {
    it('returns undefined', () => {
      const strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
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
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      expect(strategy.getViewContext()).toEqual({})
    })
  })

  describe('stopSession', () => {
    it('does not buffer the call before starting RUM', () => {
      const strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      const stopSessionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ stopSession: stopSessionSpy } as unknown as StartRumResult)

      strategy.stopSession()
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(stopSessionSpy).not.toHaveBeenCalled()
    })
  })

  describe('initConfiguration', () => {
    let strategy: Strategy
    let initConfiguration: RumInitConfiguration
    let interceptor: ReturnType<typeof interceptRequests>

    beforeEach(() => {
      interceptor = interceptRequests()
      strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('is undefined before init', () => {
      expect(strategy.initConfiguration).toBe(undefined)
    })

    it('returns the user configuration after init', () => {
      strategy.init(initConfiguration, PUBLIC_API)

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the user configuration even if skipInitIfSyntheticsWillInjectRum is true', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })

      const strategy = createPreStartStrategy(
        {
          ignoreInitIfSyntheticsWillInjectRum: true,
        },
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
      strategy.init(initConfiguration, PUBLIC_API)

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the initConfiguration with the remote configuration when a remoteConfigurationId is provided', (done) => {
      interceptor.withMockXhr((xhr) => {
        xhr.complete(200, '{"rum":{"sessionSampleRate":50}}')

        expect(strategy.initConfiguration?.sessionSampleRate).toEqual(50)
        done()
      })

      const strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
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

  describe('buffers API calls before starting RUM', () => {
    let strategy: Strategy

    beforeEach(() => {
      strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        createTrackingConsentState(),
        createCustomVitalsState(),
        doStartRumSpy
      )
    })

    it('addAction', () => {
      const addActionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addAction: addActionSpy } as unknown as StartRumResult)

      const customAction: CustomAction = {
        name: 'foo',
        type: ActionType.CUSTOM,
        startClocks: clocksNow(),
      }
      strategy.addAction(customAction)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(addActionSpy).toHaveBeenCalledOnceWith(customAction, undefined)
    })

    it('addError', () => {
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
      expect(addErrorSpy).toHaveBeenCalledOnceWith(error, undefined)
    })

    it('startView', () => {
      const startViewSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ startView: startViewSpy } as unknown as StartRumResult)

      const options = { name: 'foo' }
      const clockState = clocksNow()
      strategy.startView(options, clockState)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(startViewSpy).toHaveBeenCalledOnceWith(options, clockState)
    })

    it('addTiming', () => {
      const addTimingSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addTiming: addTimingSpy } as unknown as StartRumResult)

      const name = 'foo'
      const time = 123 as TimeStamp
      strategy.addTiming(name, time)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(addTimingSpy).toHaveBeenCalledOnceWith(name, time)
    })

    it('setViewContext', () => {
      const setViewContextSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewContext: setViewContextSpy } as unknown as StartRumResult)

      strategy.setViewContext({ foo: 'bar' })
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(setViewContextSpy).toHaveBeenCalledOnceWith({ foo: 'bar' })
    })

    it('setViewContextProperty', () => {
      const setViewContextPropertySpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewContextProperty: setViewContextPropertySpy } as unknown as StartRumResult)

      strategy.setViewContextProperty('foo', 'bar')
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(setViewContextPropertySpy).toHaveBeenCalledOnceWith('foo', 'bar')
    })

    it('setViewName', () => {
      const setViewNameSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ setViewName: setViewNameSpy } as unknown as StartRumResult)

      const name = 'foo'
      strategy.setViewName(name)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(setViewNameSpy).toHaveBeenCalledOnceWith(name)
    })

    it('addFeatureFlagEvaluation', () => {
      const addFeatureFlagEvaluationSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
      } as unknown as StartRumResult)

      const key = 'foo'
      const value = 'bar'
      strategy.addFeatureFlagEvaluation(key, value)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(addFeatureFlagEvaluationSpy).toHaveBeenCalledOnceWith(key, value)
    })

    it('startDurationVital', () => {
      const addDurationVitalSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addDurationVital: addDurationVitalSpy,
      } as unknown as StartRumResult)

      strategy.startDurationVital('timing')
      strategy.stopDurationVital('timing')

      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(addDurationVitalSpy).toHaveBeenCalled()
    })

    it('addDurationVital', () => {
      const addDurationVitalSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addDurationVital: addDurationVitalSpy,
      } as unknown as StartRumResult)

      const vitalAdd = { name: 'timing', type: VitalType.DURATION, startClocks: clocksNow(), duration: 100 as Duration }
      strategy.addDurationVital(vitalAdd)
      strategy.init(DEFAULT_INIT_CONFIGURATION, PUBLIC_API)
      expect(addDurationVitalSpy).toHaveBeenCalledOnceWith(vitalAdd)
    })
  })

  describe('tracking consent', () => {
    let strategy: Strategy
    let trackingConsentState: TrackingConsentState

    beforeEach(() => {
      trackingConsentState = createTrackingConsentState()
      strategy = createPreStartStrategy(
        {},
        getCommonContextSpy,
        trackingConsentState,
        createCustomVitalsState(),
        doStartRumSpy
      )
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

    it('starts rum if tracking consent is granted before init', () => {
      trackingConsentState.update(TrackingConsent.GRANTED)
      strategy.init(
        {
          ...DEFAULT_INIT_CONFIGURATION,
          trackingConsent: TrackingConsent.NOT_GRANTED,
        },
        PUBLIC_API
      )
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
})
