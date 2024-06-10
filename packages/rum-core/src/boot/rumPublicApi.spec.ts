import type { RelativeTime, Context, DeflateWorker, CustomerDataTrackerManager, TimeStamp } from '@datadog/browser-core'
import {
  addExperimentalFeatures,
  ExperimentalFeature,
  resetExperimentalFeatures,
  ONE_SECOND,
  display,
  DefaultPrivacyLevel,
  removeStorageListeners,
  CustomerDataCompressionStatus,
  timeStampToClocks,
} from '@datadog/browser-core'
import { cleanupSyntheticsWorkerValues } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../test'
import { setup, noopRecorderApi } from '../../test'
import { ActionType } from '../rawRumEvent.types'
import type { DurationVitalInstance } from '../domain/vital/vitalCollection'
import type { RumPublicApi, RecorderApi } from './rumPublicApi'
import { makeRumPublicApi } from './rumPublicApi'
import type { StartRum } from './startRum'

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
  startDurationVital: () => ({ stop: () => undefined }) as DurationVitalInstance,
  addDurationVital: () => undefined,
  stop: () => undefined,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const FAKE_WORKER = {} as DeflateWorker

describe('rum public api', () => {
  describe('init', () => {
    let startRumSpy: jasmine.Spy<StartRum>

    beforeEach(() => {
      startRumSpy = jasmine.createSpy().and.callFake(noopStartRum)
    })

    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    describe('deflate worker', () => {
      let rumPublicApi: RumPublicApi
      let recorderApiOnRumStartSpy: jasmine.Spy<RecorderApi['onRumStart']>

      beforeEach(() => {
        recorderApiOnRumStartSpy = jasmine.createSpy()

        rumPublicApi = makeRumPublicApi(
          startRumSpy,
          {
            ...noopRecorderApi,
            onRumStart: recorderApiOnRumStartSpy,
          },
          {
            startDeflateWorker: () => FAKE_WORKER,
          }
        )
      })

      it('pass the worker to the recorder API', () => {
        rumPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          compressIntakeRequests: true,
        })
        expect(recorderApiOnRumStartSpy.calls.mostRecent().args[4]).toBe(FAKE_WORKER)
      })
    })

    describe('customer data trackers', () => {
      it('should set the compression status to disabled if `compressIntakeRequests` is false', () => {
        const rumPublicApi = makeRumPublicApi(startRumSpy, noopRecorderApi, {
          startDeflateWorker: () => FAKE_WORKER,
        })

        rumPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          compressIntakeRequests: false,
        })

        const customerDataTrackerManager: CustomerDataTrackerManager = startRumSpy.calls.mostRecent().args[3]
        expect(customerDataTrackerManager.getCompressionStatus()).toBe(CustomerDataCompressionStatus.Disabled)
      })

      it('should set the compression status to enabled if `compressIntakeRequests` is true', () => {
        const rumPublicApi = makeRumPublicApi(startRumSpy, noopRecorderApi, {
          startDeflateWorker: () => FAKE_WORKER,
        })

        rumPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          compressIntakeRequests: true,
        })

        const customerDataTrackerManager: CustomerDataTrackerManager = startRumSpy.calls.mostRecent().args[3]
        expect(customerDataTrackerManager.getCompressionStatus()).toBe(CustomerDataCompressionStatus.Enabled)
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
    it('clones the init configuration', () => {
      const rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(rumPublicApi.getInitConfiguration()).toEqual(DEFAULT_INIT_CONFIGURATION)
      expect(rumPublicApi.getInitConfiguration()).not.toBe(DEFAULT_INIT_CONFIGURATION)
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
          handlingStack: jasmine.any(String),
        },
        { context: {}, user: {}, hasReplay: undefined },
      ])
    })

    it('should generate a handling stack', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      function triggerAction() {
        rumPublicApi.addAction('foo', { bar: 'baz' })
      }

      triggerAction()

      expect(addActionSpy).toHaveBeenCalledTimes(1)
      const stacktrace = addActionSpy.calls.argsFor(0)[0].handlingStack
      expect(stacktrace).toMatch(/^Error:\s+at triggerAction @/)
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
    })

    it('should add feature flag evaluation when ff feature_flags enabled', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      rumPublicApi.addFeatureFlagEvaluation('feature', 'foo')

      expect(addFeatureFlagEvaluationSpy.calls.argsFor(0)).toEqual(['feature', 'foo'])
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('stopSession', () => {
    it('calls stopSession on the startRum result', () => {
      const stopSessionSpy = jasmine.createSpy()
      const rumPublicApi = makeRumPublicApi(() => ({ ...noopStartRum(), stopSession: stopSessionSpy }), noopRecorderApi)
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.stopSession()
      expect(stopSessionSpy).toHaveBeenCalled()
    })
  })

  describe('startView', () => {
    it('should call RUM results startView with the view name', () => {
      const startViewSpy = jasmine.createSpy()
      const rumPublicApi = makeRumPublicApi(() => ({ ...noopStartRum(), startView: startViewSpy }), noopRecorderApi)
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startView('foo')
      expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo' })
    })

    it('should call RUM results startView with the view options', () => {
      const startViewSpy = jasmine.createSpy()
      const rumPublicApi = makeRumPublicApi(() => ({ ...noopStartRum(), startView: startViewSpy }), noopRecorderApi)
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startView({ name: 'foo', service: 'bar', version: 'baz' })
      expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo', service: 'bar', version: 'baz' })
    })
  })

  describe('recording', () => {
    let recorderApiOnRumStartSpy: jasmine.Spy<RecorderApi['onRumStart']>
    let rumPublicApi: RumPublicApi
    let recorderApi: RecorderApi

    beforeEach(() => {
      recorderApiOnRumStartSpy = jasmine.createSpy('recorderApiOnRumStart')
      recorderApi = { ...noopRecorderApi, onRumStart: recorderApiOnRumStartSpy }
      rumPublicApi = makeRumPublicApi(noopStartRum, recorderApi)
    })

    it('is started with the default defaultPrivacyLevel', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApiOnRumStartSpy.calls.mostRecent().args[1].defaultPrivacyLevel).toBe(DefaultPrivacyLevel.MASK)
    })

    it('is started with the configured defaultPrivacyLevel', () => {
      rumPublicApi.init({
        ...DEFAULT_INIT_CONFIGURATION,
        defaultPrivacyLevel: DefaultPrivacyLevel.MASK_USER_INPUT,
      })
      expect(recorderApiOnRumStartSpy.calls.mostRecent().args[1].defaultPrivacyLevel).toBe(
        DefaultPrivacyLevel.MASK_USER_INPUT
      )
    })

    it('public api calls are forwarded to the recorder api', () => {
      spyOn(recorderApi, 'start')
      spyOn(recorderApi, 'stop')
      spyOn(recorderApi, 'getSessionReplayLink')

      rumPublicApi.startSessionReplayRecording()
      rumPublicApi.stopSessionReplayRecording()
      rumPublicApi.getSessionReplayLink()

      expect(recorderApi.start).toHaveBeenCalledTimes(1)
      expect(recorderApi.stop).toHaveBeenCalledTimes(1)
      expect(recorderApi.getSessionReplayLink).toHaveBeenCalledTimes(1)
    })

    it('is started with the default startSessionReplayRecordingManually', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApiOnRumStartSpy.calls.mostRecent().args[1].startSessionReplayRecordingManually).toBe(false)
    })

    it('is started with the configured startSessionReplayRecordingManually', () => {
      rumPublicApi.init({
        ...DEFAULT_INIT_CONFIGURATION,
        startSessionReplayRecordingManually: true,
      })
      expect(recorderApiOnRumStartSpy.calls.mostRecent().args[1].startSessionReplayRecordingManually).toBe(true)
    })
  })

  describe('storeContextsAcrossPages', () => {
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
    })

    afterEach(() => {
      localStorage.clear()
      removeStorageListeners()
    })

    it('when disabled, should store contexts only in memory', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      rumPublicApi.setGlobalContext({ foo: 'bar' })
      expect(rumPublicApi.getGlobalContext()).toEqual({ foo: 'bar' })
      expect(localStorage.getItem('_dd_c_rum_2')).toBeNull()

      rumPublicApi.setUser({ qux: 'qix' })
      expect(rumPublicApi.getUser()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_rum_1')).toBeNull()
    })

    it('when enabled, should maintain user context in local storage', () => {
      rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, storeContextsAcrossPages: true })

      rumPublicApi.setUser({ qux: 'qix' })
      expect(rumPublicApi.getUser()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"qux":"qix"}')

      rumPublicApi.setUserProperty('foo', 'bar')
      expect(rumPublicApi.getUser()).toEqual({ qux: 'qix', foo: 'bar' })
      expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"qux":"qix","foo":"bar"}')

      rumPublicApi.removeUserProperty('foo')
      expect(rumPublicApi.getUser()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"qux":"qix"}')

      rumPublicApi.clearUser()
      expect(rumPublicApi.getUser()).toEqual({})
      expect(localStorage.getItem('_dd_c_rum_1')).toBe('{}')
    })

    it('when enabled, should maintain global context in local storage', () => {
      rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, storeContextsAcrossPages: true })

      rumPublicApi.setGlobalContext({ qux: 'qix' })
      expect(rumPublicApi.getGlobalContext()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"qux":"qix"}')

      rumPublicApi.setGlobalContextProperty('foo', 'bar')
      expect(rumPublicApi.getGlobalContext()).toEqual({ qux: 'qix', foo: 'bar' })
      expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"qux":"qix","foo":"bar"}')

      rumPublicApi.removeGlobalContextProperty('foo')
      expect(rumPublicApi.getGlobalContext()).toEqual({ qux: 'qix' })
      expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"qux":"qix"}')

      rumPublicApi.clearGlobalContext()
      expect(rumPublicApi.getGlobalContext()).toEqual({})
      expect(localStorage.getItem('_dd_c_rum_2')).toBe('{}')
    })

    // TODO in next major, buffer context calls to correctly apply before init set/remove/clear
    it('when enabled, before init context values should override local storage values', () => {
      localStorage.setItem('_dd_c_rum_1', '{"foo":"bar","qux":"qix"}')
      localStorage.setItem('_dd_c_rum_2', '{"foo":"bar","qux":"qix"}')
      rumPublicApi.setUserProperty('foo', 'user')
      rumPublicApi.setGlobalContextProperty('foo', 'global')

      rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, storeContextsAcrossPages: true })

      expect(rumPublicApi.getUser()).toEqual({ foo: 'user', qux: 'qix' })
      expect(rumPublicApi.getGlobalContext()).toEqual({ foo: 'global', qux: 'qix' })
      expect(localStorage.getItem('_dd_c_rum_1')).toBe('{"foo":"user","qux":"qix"}')
      expect(localStorage.getItem('_dd_c_rum_2')).toBe('{"foo":"global","qux":"qix"}')
    })
  })

  describe('startDurationVital', () => {
    beforeEach(() => {
      setup().withFakeClock().build()
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should not expose startDurationVital when ff is disabled', () => {
      const rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect((rumPublicApi as any).startDurationVital).toBeUndefined()
    })

    it('should call startDurationVital on the startRum result when ff is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.CUSTOM_VITALS])
      const startDurationVitalSpy = jasmine.createSpy()
      const rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          startDurationVital: startDurationVitalSpy,
        }),
        noopRecorderApi
      )
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ;(rumPublicApi as any).startDurationVital('foo', { context: { foo: 'bar' }, details: 'details-value' })
      expect(startDurationVitalSpy).toHaveBeenCalledWith({
        name: 'foo',
        details: 'details-value',
        context: { foo: 'bar' },
      })
    })
  })

  describe('addDurationVital', () => {
    beforeEach(() => {
      setup().withFakeClock().build()
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should not expose addDurationVital when ff is disabled', () => {
      const rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect((rumPublicApi as any).addDurationVital).toBeUndefined()
    })

    it('should call addDurationVital on the startRum result when ff is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.CUSTOM_VITALS])
      const addDurationVitalSpy = jasmine.createSpy()
      const rumPublicApi = makeRumPublicApi(
        () => ({
          ...noopStartRum(),
          addDurationVital: addDurationVitalSpy,
        }),
        noopRecorderApi
      )
      const startTime = 1707755888000 as TimeStamp
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ;(rumPublicApi as any).addDurationVital('foo', {
        startTime,
        duration: 100,
        context: { foo: 'bar' },
        details: 'details-value',
      })
      expect(addDurationVitalSpy).toHaveBeenCalledWith({
        name: 'foo',
        startClocks: timeStampToClocks(startTime),
        duration: 100,
        context: { foo: 'bar' },
        details: 'details-value',
      })
    })
  })

  it('should provide sdk version', () => {
    const rumPublicApi = makeRumPublicApi(noopStartRum, noopRecorderApi)
    expect(rumPublicApi.version).toBe('test')
  })
})
