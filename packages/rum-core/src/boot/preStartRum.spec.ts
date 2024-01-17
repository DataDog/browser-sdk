import type { DeflateWorker, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { display, getTimeStamp, noop, relativeToClocks, clocksNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  cleanupSyntheticsWorkerValues,
  deleteEventBridgeStub,
  initEventBridgeStub,
  mockClock,
  mockSyntheticsWorkerValues,
} from '@datadog/browser-core/test'
import type { HybridInitConfiguration, RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { CommonContext } from '../domain/contexts/commonContext'
import type { ViewOptions } from '../domain/view/trackViews'
import { ActionType } from '../rawRumEvent.types'
import type { CustomAction } from '../domain/action/actionCollection'
import type { Strategy } from './rumPublicApi'
import type { StartRumResult } from './startRum'
import { createPreStartStrategy } from './preStartRum'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = { clientToken: 'yes' } as RumInitConfiguration
const FAKE_WORKER = {} as DeflateWorker

describe('preStartRum', () => {
  let doStartRumSpy: jasmine.Spy<
    (
      initConfiguration: RumInitConfiguration,
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

  describe('configuration validation', () => {
    let strategy: Strategy
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
    })

    it('should start when the configuration is valid', () => {
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(displaySpy).not.toHaveBeenCalled()
      expect(doStartRumSpy).toHaveBeenCalled()
    })

    it('should not start when the configuration is missing', () => {
      ;(strategy.init as () => void)()
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartRumSpy).not.toHaveBeenCalled()
    })

    it('should not start when the configuration is invalid', () => {
      strategy.init(INVALID_INIT_CONFIGURATION)
      expect(displaySpy).toHaveBeenCalled()
      expect(doStartRumSpy).not.toHaveBeenCalled()
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

      it('init should accept empty application id and client token', () => {
        const hybridInitConfiguration: HybridInitConfiguration = {}
        strategy.init(hybridInitConfiguration as RumInitConfiguration)
        expect(display.error).not.toHaveBeenCalled()
      })

      it('init should force session sample rate to 100', () => {
        const invalidConfiguration: HybridInitConfiguration = { sessionSampleRate: 50 }
        strategy.init(invalidConfiguration as RumInitConfiguration)
        expect(strategy.initConfiguration?.sessionSampleRate).toEqual(100)
      })

      it('should initialize even if session cannot be handled', () => {
        spyOnProperty(document, 'cookie', 'get').and.returnValue('')
        strategy.init(DEFAULT_INIT_CONFIGURATION)
        expect(doStartRumSpy).toHaveBeenCalled()
      })
    })
  })

  describe('init', () => {
    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    it('should not initialize if session cannot be handled and bridge is not present', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const displaySpy = spyOn(display, 'warn')
      const strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
      strategy.init(DEFAULT_INIT_CONFIGURATION)
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
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION)

        expect(doStartRumSpy).not.toHaveBeenCalled()
      })

      it('when false, does not ignore init() call even if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const strategy = createPreStartStrategy(
          {
            ignoreInitIfSyntheticsWillInjectRum: false,
          },
          getCommonContextSpy,
          doStartRumSpy
        )
        strategy.init(DEFAULT_INIT_CONFIGURATION)

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
          doStartRumSpy
        )
      })

      afterEach(() => {
        deleteEventBridgeStub()
      })

      describe('with compressIntakeRequests: false', () => {
        it('does not create a deflate worker', () => {
          strategy.init(DEFAULT_INIT_CONFIGURATION)

          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[2]
          expect(worker).toBeUndefined()
        })
      })

      describe('with compressIntakeRequests: true', () => {
        it('creates a deflate worker instance', () => {
          strategy.init({
            ...DEFAULT_INIT_CONFIGURATION,
            compressIntakeRequests: true,
          })

          expect(startDeflateWorkerSpy).toHaveBeenCalledTimes(1)
          const worker: DeflateWorker | undefined = doStartRumSpy.calls.mostRecent().args[2]
          expect(worker).toBeDefined()
        })

        it('aborts the initialization if it fails to create a deflate worker', () => {
          startDeflateWorkerSpy.and.returnValue(undefined)

          strategy.init({
            ...DEFAULT_INIT_CONFIGURATION,
            compressIntakeRequests: true,
          })

          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('if message bridge is present, does not create a deflate worker instance', () => {
          initEventBridgeStub()

          strategy.init({
            ...DEFAULT_INIT_CONFIGURATION,
            compressIntakeRequests: true,
          })

          expect(startDeflateWorkerSpy).not.toHaveBeenCalled()
          expect(doStartRumSpy).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('trackViews mode', () => {
      const AUTO_CONFIGURATION = { ...DEFAULT_INIT_CONFIGURATION }
      const MANUAL_CONFIGURATION = { ...AUTO_CONFIGURATION, trackViewsManually: true }

      let clock: Clock | undefined
      let strategy: Strategy
      let startViewSpy: jasmine.Spy<StartRumResult['startView']>
      let addTimingSpy: jasmine.Spy<StartRumResult['addTiming']>

      beforeEach(() => {
        startViewSpy = jasmine.createSpy('startView')
        addTimingSpy = jasmine.createSpy('addTiming')
        doStartRumSpy.and.returnValue({
          startView: startViewSpy,
          addTiming: addTimingSpy,
        } as unknown as StartRumResult)
        strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
      })

      afterEach(() => {
        if (clock) {
          clock.cleanup()
        }
      })

      describe('when auto', () => {
        it('should start rum at init', () => {
          strategy.init(AUTO_CONFIGURATION)

          expect(doStartRumSpy).toHaveBeenCalled()
        })

        it('before init startView should be handled after init', () => {
          clock = mockClock()

          clock.tick(10)
          strategy.startView({ name: 'foo' })

          expect(startViewSpy).not.toHaveBeenCalled()

          clock.tick(20)
          strategy.init(AUTO_CONFIGURATION)

          expect(startViewSpy).toHaveBeenCalled()
          expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo' })
          expect(startViewSpy.calls.argsFor(0)[1]).toEqual({
            relative: 10 as RelativeTime,
            timeStamp: jasmine.any(Number) as unknown as TimeStamp,
          })
        })
      })

      describe('when views are tracked manually', () => {
        it('should not start rum at init', () => {
          strategy.init(MANUAL_CONFIGURATION)

          expect(doStartRumSpy).not.toHaveBeenCalled()
        })

        it('calling startView then init should start rum', () => {
          strategy.startView({ name: 'foo' })
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.init(MANUAL_CONFIGURATION)
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).not.toHaveBeenCalled()
        })

        it('calling startView twice before init should start rum and create a new view', () => {
          clock = mockClock()
          clock.tick(10)
          strategy.startView({ name: 'foo' })

          clock.tick(10)
          strategy.startView({ name: 'bar' })

          clock.tick(10)
          strategy.init(MANUAL_CONFIGURATION)

          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
          expect(initialViewOptions).toEqual({ name: 'foo' })
          expect(startViewSpy).toHaveBeenCalledOnceWith({ name: 'bar' }, relativeToClocks(20 as RelativeTime))
        })

        it('calling init then startView should start rum', () => {
          strategy.init(MANUAL_CONFIGURATION)
          expect(doStartRumSpy).not.toHaveBeenCalled()
          expect(startViewSpy).not.toHaveBeenCalled()

          strategy.startView({ name: 'foo' })
          expect(doStartRumSpy).toHaveBeenCalled()
          const initialViewOptions: ViewOptions | undefined = doStartRumSpy.calls.argsFor(0)[3]
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
          strategy.init(MANUAL_CONFIGURATION)

          expect(addTimingSpy).toHaveBeenCalledTimes(2)

          expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('first')
          expect(addTimingSpy.calls.argsFor(0)[1]).toEqual(getTimeStamp(10 as RelativeTime))

          expect(addTimingSpy.calls.argsFor(1)[0]).toEqual('second')
          expect(addTimingSpy.calls.argsFor(1)[1]).toEqual(getTimeStamp(30 as RelativeTime))
        })
      })
    })
  })

  describe('getInternalContext', () => {
    it('returns undefined', () => {
      const strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
      expect(strategy.getInternalContext()).toBe(undefined)
    })
  })

  describe('stopSession', () => {
    it('does not buffer the call before starting RUM', () => {
      const strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
      const stopSessionSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ stopSession: stopSessionSpy } as unknown as StartRumResult)

      strategy.stopSession()
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(stopSessionSpy).not.toHaveBeenCalled()
    })
  })

  describe('initConfiguration', () => {
    let strategy: Strategy
    let initConfiguration: RumInitConfiguration

    beforeEach(() => {
      strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
      initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }
    })

    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    it('is undefined before init', () => {
      expect(strategy.initConfiguration).toBe(undefined)
    })

    it('returns the user configuration after init', () => {
      strategy.init(initConfiguration)

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })

    it('returns the user configuration even if skipInitIfSyntheticsWillInjectRum is true', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })

      const strategy = createPreStartStrategy(
        {
          ignoreInitIfSyntheticsWillInjectRum: true,
        },
        getCommonContextSpy,
        doStartRumSpy
      )
      strategy.init(initConfiguration)

      expect(strategy.initConfiguration).toEqual(initConfiguration)
    })
  })

  describe('buffers API calls before starting RUM', () => {
    let strategy: Strategy

    beforeEach(() => {
      strategy = createPreStartStrategy({}, getCommonContextSpy, doStartRumSpy)
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
      strategy.init(DEFAULT_INIT_CONFIGURATION)
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
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(addErrorSpy).toHaveBeenCalledOnceWith(error, undefined)
    })

    it('startView', () => {
      const startViewSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ startView: startViewSpy } as unknown as StartRumResult)

      const options = { name: 'foo' }
      const clockState = clocksNow()
      strategy.startView(options, clockState)
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(startViewSpy).toHaveBeenCalledOnceWith(options, clockState)
    })

    it('addTiming', () => {
      const addTimingSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({ addTiming: addTimingSpy } as unknown as StartRumResult)

      const name = 'foo'
      const time = 123 as TimeStamp
      strategy.addTiming(name, time)
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(addTimingSpy).toHaveBeenCalledOnceWith(name, time)
    })

    it('addFeatureFlagEvaluation', () => {
      const addFeatureFlagEvaluationSpy = jasmine.createSpy()
      doStartRumSpy.and.returnValue({
        addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
      } as unknown as StartRumResult)

      const key = 'foo'
      const value = 'bar'
      strategy.addFeatureFlagEvaluation(key, value)
      strategy.init(DEFAULT_INIT_CONFIGURATION)
      expect(addFeatureFlagEvaluationSpy).toHaveBeenCalledOnceWith(key, value)
    })
  })
})
