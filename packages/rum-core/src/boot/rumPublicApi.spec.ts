import type { RelativeTime, TimeStamp, Context } from '@datadog/browser-core'
import { ONE_SECOND, getTimeStamp, display, DefaultPrivacyLevel } from '@datadog/browser-core'
import {
  initEventBridgeStub,
  deleteEventBridgeStub,
  cleanupSyntheticsWorkerValues,
  mockSyntheticsWorkerValues,
} from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../test'
import { setup, noopRecorderApi } from '../../test'
import type { HybridInitConfiguration, RumInitConfiguration } from '../domain/configuration'
import { ActionType } from '../rawRumEvent.types'
import type { RumPublicApi, StartRum, RecorderApi } from './rumPublicApi'
import { makeRumPublicApi } from './rumPublicApi'

const noopStartRum = (): ReturnType<StartRum> => ({
  addAction: () => undefined,
  addError: () => undefined,
  addTiming: () => undefined,
  addFeatureFlagEvaluation: () => undefined,
  startView: () => undefined,
  getInternalContext: () => undefined,
  lifeCycle: {} as any,
  viewContexts: {} as any,
  session: {} as any,
  stopSession: () => undefined,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const INVALID_INIT_CONFIGURATION = { clientToken: 'yes' } as RumInitConfiguration

describe('rum public api', () => {
  describe('configuration validation', () => {
    let rumPublicApi: RumPublicApi
    let displaySpy: jasmine.Spy
    let startRumSpy: jasmine.Spy<StartRum>

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      startRumSpy = jasmine.createSpy().and.callFake(noopStartRum)
      rumPublicApi = makeRumPublicApi(startRumSpy, noopRecorderApi)
    })

    it('should start when the configuration is valid', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(displaySpy).not.toHaveBeenCalled()
      expect(startRumSpy).toHaveBeenCalled()
    })

    it('should not start when the configuration is invalid', () => {
      rumPublicApi.init(INVALID_INIT_CONFIGURATION)
      expect(displaySpy).toHaveBeenCalled()
      expect(startRumSpy).not.toHaveBeenCalled()
    })

    describe('multiple init', () => {
      it('should log an error if init is called several times', () => {
        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(displaySpy).toHaveBeenCalledTimes(0)

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(displaySpy).toHaveBeenCalledTimes(1)
      })

      it('should not log an error if init is called several times and silentMultipleInit is true', () => {
        rumPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          silentMultipleInit: true,
        })
        expect(displaySpy).toHaveBeenCalledTimes(0)

        rumPublicApi.init({
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
        rumPublicApi.init(hybridInitConfiguration as RumInitConfiguration)
        expect(display.error).not.toHaveBeenCalled()
      })

      it('init should force session sample rate to 100', () => {
        const invalidConfiguration: HybridInitConfiguration = { sessionSampleRate: 50 }
        rumPublicApi.init(invalidConfiguration as RumInitConfiguration)
        expect(rumPublicApi.getInitConfiguration()?.sessionSampleRate).toEqual(100)
      })
    })
  })

  describe('init', () => {
    let startRumSpy: jasmine.Spy<StartRum>

    beforeEach(() => {
      startRumSpy = jasmine.createSpy()
    })

    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    describe('skipInitIfSyntheticsWillInjectRum option', () => {
      it('when true, ignores init() call if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const rumPublicApi = makeRumPublicApi(startRumSpy, noopRecorderApi, {
          ignoreInitIfSyntheticsWillInjectRum: true,
        })
        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(startRumSpy).not.toHaveBeenCalled()
      })

      it('when false, does not ignore init() call even if Synthetics will inject its own instance of RUM', () => {
        mockSyntheticsWorkerValues({ injectsRum: true })

        const rumPublicApi = makeRumPublicApi(startRumSpy, noopRecorderApi, {
          ignoreInitIfSyntheticsWillInjectRum: false,
        })
        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(startRumSpy).toHaveBeenCalled()
      })
    })
  })

  describe('getInternalContext', () => {
    let getInternalContextSpy: jasmine.Spy<ReturnType<StartRum>['getInternalContext']>
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      getInternalContextSpy = jasmine.createSpy().and.callFake(() => ({
        application_id: '123',
        session_id: '123',
      }))
      rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          getInternalContext: getInternalContextSpy,
        }),
        noopRecorderApi
      )
    })

    it('returns undefined before init', () => {
      expect(rumPublicApi.getInternalContext()).toBe(undefined)
      expect(getInternalContextSpy).not.toHaveBeenCalled()
    })

    it('returns the internal context after init', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(rumPublicApi.getInternalContext()).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalled()
    })

    it('uses the startTime if specified', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      const startTime = 234832890
      expect(rumPublicApi.getInternalContext(startTime)).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalledWith(startTime)
    })
  })

  describe('getInitConfiguration', () => {
    let rumPublicApi: RumPublicApi
    let initConfiguration: RumInitConfiguration

    beforeEach(() => {
      rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
      initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }
    })
    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    it('returns undefined before init', () => {
      expect(rumPublicApi.getInitConfiguration()).toBe(undefined)
    })

    it('returns the user configuration after init', () => {
      rumPublicApi.init(initConfiguration)

      expect(rumPublicApi.getInitConfiguration()).toEqual(initConfiguration)
      expect(rumPublicApi.getInitConfiguration()).not.toBe(initConfiguration)
    })

    it('returns the user configuration even if skipInitIfSyntheticsWillInjectRum is true', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })

      const rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi, {
        ignoreInitIfSyntheticsWillInjectRum: true,
      })
      rumPublicApi.init(initConfiguration)

      expect(rumPublicApi.getInitConfiguration()).toEqual(initConfiguration)
      expect(rumPublicApi.getInitConfiguration()).not.toBe(initConfiguration)
    })
  })

  describe('addAction', () => {
    let addActionSpy: jasmine.Spy<ReturnType<StartRum>['addAction']>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addActionSpy = jasmine.createSpy()
      rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          addAction: addActionSpy,
        }),
        noopRecorderApi
      )
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('allows sending actions before init', () => {
      rumPublicApi.addAction('foo', { bar: 'baz' })

      expect(addActionSpy).not.toHaveBeenCalled()
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy).toHaveBeenCalledTimes(1)
      expect(addActionSpy.calls.argsFor(0)).toEqual([
        {
          context: { bar: 'baz' },
          name: 'foo',
          startClocks: jasmine.any(Object),
          type: ActionType.CUSTOM,
        },
        { context: {}, user: {}, hasReplay: undefined },
      ])
    })

    describe('save context when sending an action', () => {
      it('saves the date', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(ONE_SECOND)
        rumPublicApi.addAction('foo')

        clock.tick(ONE_SECOND)
        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[0].startClocks.relative as number).toEqual(ONE_SECOND)
      })

      it('stores a deep copy of the global context', () => {
        rumPublicApi.setGlobalContextProperty('foo', 'bar')
        rumPublicApi.addAction('message')
        rumPublicApi.setGlobalContextProperty('foo', 'baz')

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[1]!.context).toEqual({
          foo: 'bar',
        })
      })

      it('stores a deep copy of the user', () => {
        const user = { id: 'foo' }
        rumPublicApi.setUser(user)
        rumPublicApi.addAction('message')
        user.id = 'bar'

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({
          id: 'foo',
        })
      })

      it('stores a deep copy of the action context', () => {
        const context = { foo: 'bar' }
        rumPublicApi.addAction('message', context)
        context.foo = 'baz'

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[0].context).toEqual({
          foo: 'bar',
        })
      })
    })
  })

  describe('addError', () => {
    let addErrorSpy: jasmine.Spy<ReturnType<StartRum>['addError']>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addErrorSpy = jasmine.createSpy()
      rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          addError: addErrorSpy,
        }),
        noopRecorderApi
      )
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('allows capturing an error before init', () => {
      rumPublicApi.addError(new Error('foo'))

      expect(addErrorSpy).not.toHaveBeenCalled()
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addErrorSpy).toHaveBeenCalledTimes(1)
      expect(addErrorSpy.calls.argsFor(0)).toEqual([
        {
          context: undefined,
          error: new Error('foo'),
          handlingStack: jasmine.any(String),
          startClocks: jasmine.any(Object),
        },
        { context: {}, user: {}, hasReplay: undefined },
      ])
    })

    it('should generate a handling stack', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      function triggerError() {
        rumPublicApi.addError(new Error('message'))
      }
      triggerError()
      expect(addErrorSpy).toHaveBeenCalledTimes(1)
      const stacktrace = addErrorSpy.calls.argsFor(0)[0].handlingStack
      expect(stacktrace).toMatch(/^Error:\s+at triggerError (.|\n)*$/)
    })

    describe('save context when capturing an error', () => {
      it('saves the date', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(ONE_SECOND)
        rumPublicApi.addError(new Error('foo'))

        clock.tick(ONE_SECOND)
        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].startClocks.relative as number).toEqual(ONE_SECOND)
      })

      it('stores a deep copy of the global context', () => {
        rumPublicApi.setGlobalContextProperty('foo', 'bar')
        rumPublicApi.addError(new Error('message'))
        rumPublicApi.setGlobalContextProperty('foo', 'baz')

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[1]!.context).toEqual({
          foo: 'bar',
        })
      })

      it('stores a deep copy of the user', () => {
        const user = { id: 'foo' }
        rumPublicApi.setUser(user)
        rumPublicApi.addError(new Error('message'))
        user.id = 'bar'

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[1]!.user).toEqual({
          id: 'foo',
        })
      })

      it('stores a deep copy of the error context', () => {
        const context = { foo: 'bar' }
        rumPublicApi.addError(new Error('message'), context)
        context.foo = 'baz'

        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].context).toEqual({
          foo: 'bar',
        })
      })
    })
  })

  describe('setUser', () => {
    let addActionSpy: jasmine.Spy<ReturnType<StartRum>['addAction']>
    let displaySpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addActionSpy = jasmine.createSpy()
      displaySpy = spyOn(display, 'error')
      rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          addAction: addActionSpy,
        }),
        noopRecorderApi
      )
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should attach valid objects', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
      rumPublicApi.setUser(user)
      rumPublicApi.addAction('message')

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({
        email: 'qux',
        foo: { bar: 'qux' },
        id: 'foo',
        name: 'bar',
      })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should sanitize predefined properties', () => {
      const user = { id: null, name: 2, email: { bar: 'qux' } }
      rumPublicApi.setUser(user as any)
      rumPublicApi.addAction('message')

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({
        email: '[object Object]',
        id: 'null',
        name: '2',
      })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should remove the user', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux' }
      rumPublicApi.setUser(user)
      rumPublicApi.clearUser()
      rumPublicApi.addAction('message')

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({})
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should reject non object input', () => {
      rumPublicApi.setUser(2 as any)
      rumPublicApi.setUser(null as any)
      rumPublicApi.setUser(undefined as any)
      expect(displaySpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('getUser', () => {
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
    })

    it('should return empty object if no user has been set', () => {
      const userClone = rumPublicApi.getUser()
      expect(userClone).toEqual({})
    })

    it('should return a clone of the original object if set', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
      rumPublicApi.setUser(user)
      const userClone = rumPublicApi.getUser()
      const userClone2 = rumPublicApi.getUser()

      expect(userClone).not.toBe(user)
      expect(userClone).not.toBe(userClone2)
      expect(userClone).toEqual(user)
    })
  })

  describe('setUserProperty', () => {
    const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
    const addressAttribute = { city: 'Paris' }
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
    })

    it('should add attribute', () => {
      rumPublicApi.setUser(user)
      rumPublicApi.setUserProperty('address', addressAttribute)
      const userClone = rumPublicApi.getUser()

      expect(userClone.address).toEqual(addressAttribute)
    })

    it('should not contain original reference to object', () => {
      const userDetails: { [key: string]: any } = { name: 'john' }
      rumPublicApi.setUser(user)
      rumPublicApi.setUserProperty('userDetails', userDetails)
      userDetails.DOB = '11/11/1999'
      const userClone = rumPublicApi.getUser()

      expect(userClone.userDetails).not.toBe(userDetails)
    })

    it('should override attribute', () => {
      rumPublicApi.setUser(user)
      rumPublicApi.setUserProperty('foo', addressAttribute)
      const userClone = rumPublicApi.getUser()

      expect(userClone).toEqual({ ...user, foo: addressAttribute })
    })

    it('should sanitize properties', () => {
      rumPublicApi.setUserProperty('id', 123)
      rumPublicApi.setUserProperty('name', ['Adam', 'Smith'])
      rumPublicApi.setUserProperty('email', { foo: 'bar' })
      const userClone = rumPublicApi.getUser()

      expect(userClone.id).toEqual('123')
      expect(userClone.name).toEqual('Adam,Smith')
      expect(userClone.email).toEqual('[object Object]')
    })
  })

  describe('removeUserProperty', () => {
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
    })

    it('should remove property', () => {
      const user: Context = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }

      rumPublicApi.setUser(user)
      rumPublicApi.removeUserProperty('foo')
      const userClone = rumPublicApi.getUser()
      expect(userClone.foo).toBeUndefined()
    })
  })

  describe('addTiming', () => {
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let displaySpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addTimingSpy = jasmine.createSpy()
      displaySpy = spyOn(display, 'error')
      rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          addTiming: addTimingSpy,
        }),
        noopRecorderApi
      )
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should allow to add custom timing before init', () => {
      const { clock } = setupBuilder.withFakeClock().build()

      clock.tick(10)
      rumPublicApi.addTiming('foo')

      expect(addTimingSpy).not.toHaveBeenCalled()

      clock.tick(20)
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('foo')
      expect(addTimingSpy.calls.argsFor(0)[1]).toEqual(getTimeStamp(10 as RelativeTime))
    })

    it('should add custom timings', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      rumPublicApi.addTiming('foo')

      expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('foo')
      expect(addTimingSpy.calls.argsFor(0)[1]).toBeUndefined()
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('adds custom timing with provided time', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      rumPublicApi.addTiming('foo', 12)

      expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('foo')
      expect(addTimingSpy.calls.argsFor(0)[1]).toBe(12 as RelativeTime)
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('addFeatureFlagEvaluation', () => {
    let addFeatureFlagEvaluationSpy: jasmine.Spy<ReturnType<StartRum>['addFeatureFlagEvaluation']>
    let displaySpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addFeatureFlagEvaluationSpy = jasmine.createSpy()
      displaySpy = spyOn(display, 'error')
      rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
        }),
        noopRecorderApi
      )
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should add feature flag evaluation when ff feature_flags enabled', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      rumPublicApi.addFeatureFlagEvaluation('feature', 'foo')

      expect(addFeatureFlagEvaluationSpy.calls.argsFor(0)).toEqual(['feature', 'foo'])
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('trackViews mode', () => {
    const AUTO_CONFIGURATION = { ...DEFAULT_INIT_CONFIGURATION }
    const MANUAL_CONFIGURATION = { ...AUTO_CONFIGURATION, trackViewsManually: true }

    let startRumSpy: jasmine.Spy<StartRum>
    let startViewSpy: jasmine.Spy<ReturnType<StartRum>['startView']>
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let displaySpy: jasmine.Spy<() => void>
    let recorderApiOnRumStartSpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      startViewSpy = jasmine.createSpy('startView')
      addTimingSpy = jasmine.createSpy('addTiming')
      displaySpy = spyOn(display, 'error')
      startRumSpy = jasmine.createSpy('startRum').and.returnValue({
        ...noopStartRum(),
        addTiming: addTimingSpy,
        startView: startViewSpy,
      })
      recorderApiOnRumStartSpy = jasmine.createSpy('recorderApiOnRumStart')
      rumPublicApi = makeRumPublicApi(startRumSpy, { ...noopRecorderApi, onRumStart: recorderApiOnRumStartSpy })
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    describe('when auto', () => {
      it('should start rum at init', () => {
        rumPublicApi.init(AUTO_CONFIGURATION)

        expect(startRumSpy).toHaveBeenCalled()
        expect(recorderApiOnRumStartSpy).toHaveBeenCalled()
      })

      it('before init startView should be handled after init', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(10)
        rumPublicApi.startView('foo')

        expect(startViewSpy).not.toHaveBeenCalled()

        clock.tick(20)
        rumPublicApi.init(AUTO_CONFIGURATION)

        expect(startViewSpy).toHaveBeenCalled()
        expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo' })
        expect(startViewSpy.calls.argsFor(0)[1]).toEqual({
          relative: 10 as RelativeTime,
          timeStamp: jasmine.any(Number) as unknown as TimeStamp,
        })
      })

      it('after init startView should be handle immediately', () => {
        rumPublicApi.init(AUTO_CONFIGURATION)

        rumPublicApi.startView('foo')

        expect(startViewSpy).toHaveBeenCalled()
        expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo' })
        expect(startViewSpy.calls.argsFor(0)[1]).toBeUndefined()
        expect(displaySpy).not.toHaveBeenCalled()
      })
    })

    describe('when views are tracked manually', () => {
      it('should not start rum at init', () => {
        rumPublicApi.init(MANUAL_CONFIGURATION)

        expect(startRumSpy).not.toHaveBeenCalled()
        expect(recorderApiOnRumStartSpy).not.toHaveBeenCalled()
      })

      it('before init startView should start rum', () => {
        rumPublicApi.startView('foo')
        expect(startRumSpy).not.toHaveBeenCalled()
        expect(startViewSpy).not.toHaveBeenCalled()

        rumPublicApi.init(MANUAL_CONFIGURATION)
        expect(startRumSpy).toHaveBeenCalled()
        expect(startRumSpy.calls.argsFor(0)[5]).toEqual({ name: 'foo' })
        expect(recorderApiOnRumStartSpy).toHaveBeenCalled()
        expect(startViewSpy).not.toHaveBeenCalled()
      })

      it('after init startView should start rum', () => {
        rumPublicApi.init(MANUAL_CONFIGURATION)
        expect(startRumSpy).not.toHaveBeenCalled()
        expect(startViewSpy).not.toHaveBeenCalled()

        rumPublicApi.startView('foo')
        expect(startRumSpy).toHaveBeenCalled()
        expect(startRumSpy.calls.argsFor(0)[5]).toEqual({ name: 'foo' })
        expect(recorderApiOnRumStartSpy).toHaveBeenCalled()
        expect(startViewSpy).not.toHaveBeenCalled()
      })

      it('after start rum startView should start view', () => {
        rumPublicApi.init(MANUAL_CONFIGURATION)
        rumPublicApi.startView('foo')
        rumPublicApi.startView('bar')

        expect(startRumSpy).toHaveBeenCalled()
        expect(startRumSpy.calls.argsFor(0)[5]).toEqual({ name: 'foo' })
        expect(recorderApiOnRumStartSpy).toHaveBeenCalled()
        expect(startViewSpy).toHaveBeenCalled()
        expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'bar' })
        expect(startViewSpy.calls.argsFor(0)[1]).toBeUndefined()
      })

      it('API calls should be handled in order', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(10)
        rumPublicApi.addTiming('first')

        clock.tick(10)
        rumPublicApi.startView('foo')

        clock.tick(10)
        rumPublicApi.addTiming('second')

        clock.tick(10)
        rumPublicApi.init(MANUAL_CONFIGURATION)

        clock.tick(10)
        rumPublicApi.addTiming('third')

        expect(addTimingSpy).toHaveBeenCalledTimes(3)

        expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('first')
        expect(addTimingSpy.calls.argsFor(0)[1]).toEqual(getTimeStamp(10 as RelativeTime))

        expect(addTimingSpy.calls.argsFor(1)[0]).toEqual('second')
        expect(addTimingSpy.calls.argsFor(1)[1]).toEqual(getTimeStamp(30 as RelativeTime))

        expect(addTimingSpy.calls.argsFor(2)[0]).toEqual('third')
        expect(addTimingSpy.calls.argsFor(2)[1]).toBeUndefined() // no time saved when started
      })
    })
  })

  describe('stopSession', () => {
    let rumPublicApi: RumPublicApi
    let stopSessionSpy: jasmine.Spy

    beforeEach(() => {
      stopSessionSpy = jasmine.createSpy()
      rumPublicApi = makeRumPublicApi(() => ({ ...noopStartRum(), stopSession: stopSessionSpy }), noopRecorderApi)
    })

    it('calls stopSession on the startRum result', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.stopSession()
      expect(stopSessionSpy).toHaveBeenCalled()
    })

    it('does nothing when called before init', () => {
      rumPublicApi.stopSession()
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(stopSessionSpy).not.toHaveBeenCalled()
    })
  })

  describe('recording', () => {
    let recorderApiOnRumStartSpy: jasmine.Spy<RecorderApi['onRumStart']>
    let setupBuilder: TestSetupBuilder
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      recorderApiOnRumStartSpy = jasmine.createSpy('recorderApiOnRumStart')
      rumPublicApi = makeRumPublicApi(noopStartRum, { ...noopRecorderApi, onRumStart: recorderApiOnRumStartSpy })
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('recording is started with the default defaultPrivacyLevel', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApiOnRumStartSpy.calls.mostRecent().args[1].defaultPrivacyLevel).toBe(DefaultPrivacyLevel.MASK)
    })

    it('recording is started with the configured defaultPrivacyLevel', () => {
      rumPublicApi.init({
        ...DEFAULT_INIT_CONFIGURATION,
        defaultPrivacyLevel: DefaultPrivacyLevel.MASK_USER_INPUT,
      })
      expect(recorderApiOnRumStartSpy.calls.mostRecent().args[1].defaultPrivacyLevel).toBe(
        DefaultPrivacyLevel.MASK_USER_INPUT
      )
    })
  })

  it('should provide sdk version', () => {
    const rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
    expect(rumPublicApi.version).toBe('test')
  })
})
