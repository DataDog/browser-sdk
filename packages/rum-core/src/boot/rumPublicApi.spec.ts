import type { RelativeTime, DeflateWorker, TimeStamp } from '@datadog/browser-core'
import {
  ONE_SECOND,
  display,
  DefaultPrivacyLevel,
  timeStampToClocks,
  stopSessionManager,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  collectAsyncCalls,
  mockClock,
  mockEventBridge,
  createFakeTelemetryObject,
  mockExperimentalFeatures,
} from '@datadog/browser-core/test'
import { noopRecorderApi, noopProfilerApi } from '../../test'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { DurationVitalReference } from '../domain/vital/vitalCollection'
import type { RumPublicApi, RecorderApi, ProfilerApi, RumPublicApiOptions } from './rumPublicApi'
import { makeRumPublicApi } from './rumPublicApi'
import type { StartRum } from './startRum'

const noopStartRum = (): ReturnType<StartRum> => ({
  addAction: () => undefined,
  addError: () => undefined,
  addEvent: () => undefined,
  addTiming: () => undefined,
  addFeatureFlagEvaluation: () => undefined,
  startView: () => undefined,
  setViewContext: () => undefined,
  setViewContextProperty: () => undefined,
  setViewName: () => undefined,
  getViewContext: () => ({}),
  getInternalContext: () => undefined,
  lifeCycle: {} as any,
  viewHistory: {} as any,
  longTaskContexts: {} as any,
  sessionManager: {} as any,
  stopSession: () => undefined,
  startDurationVital: () => ({}) as DurationVitalReference,
  stopDurationVital: () => undefined,
  addDurationVital: () => undefined,
  stop: () => undefined,
  globalContext: {} as any,
  userContext: {} as any,
  accountContext: {} as any,
  hooks: {} as any,
  telemetry: {} as any,
  addOperationStepVital: () => undefined,
  startAction: () => undefined,
  stopAction: () => undefined,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const FAKE_WORKER = {} as DeflateWorker

describe('rum public api', () => {
  afterEach(() => {
    stopSessionManager()
  })

  describe('init', () => {
    describe('deflate worker', () => {
      let rumPublicApi: RumPublicApi
      let recorderApiOnRumStartSpy: jasmine.Spy<RecorderApi['onRumStart']>

      beforeEach(() => {
        recorderApiOnRumStartSpy = jasmine.createSpy()
        ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
          recorderApi: {
            onRumStart: recorderApiOnRumStartSpy,
          },
          rumPublicApiOptions: {
            startDeflateWorker: () => FAKE_WORKER,
          },
        }))
      })

      it('pass the worker to the recorder API', async () => {
        rumPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          compressIntakeRequests: true,
        })
        await collectAsyncCalls(recorderApiOnRumStartSpy, 1)
        expect(recorderApiOnRumStartSpy.calls.mostRecent().args[4]).toBe(FAKE_WORKER)
      })
    })
  })

  describe('getInternalContext', () => {
    let getInternalContextSpy: jasmine.Spy<ReturnType<StartRum>['getInternalContext']>
    let rumPublicApi: RumPublicApi
    let startRumSpy: jasmine.Spy<StartRum>

    beforeEach(() => {
      getInternalContextSpy = jasmine.createSpy().and.callFake(() => ({
        application_id: '123',
        session_id: '123',
      }))
      ;({ rumPublicApi, startRumSpy } = makeRumPublicApiWithDefaults({
        startRumResult: {
          getInternalContext: getInternalContextSpy,
        },
      }))
    })

    it('returns the internal context after init', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(startRumSpy, 1)

      expect(rumPublicApi.getInternalContext()).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalled()
    })

    it('uses the startTime if specified', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(startRumSpy, 1)

      const startTime = 234832890
      expect(rumPublicApi.getInternalContext(startTime)).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalledWith(startTime)
    })
  })

  describe('getInitConfiguration', () => {
    it('clones the init configuration', () => {
      const { rumPublicApi } = makeRumPublicApiWithDefaults()

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(rumPublicApi.getInitConfiguration()).toEqual(DEFAULT_INIT_CONFIGURATION)
      expect(rumPublicApi.getInitConfiguration()).not.toBe(DEFAULT_INIT_CONFIGURATION)
    })
  })

  describe('addAction', () => {
    let addActionSpy: jasmine.Spy<ReturnType<StartRum>['addAction']>
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      mockEventBridge()
      addActionSpy = jasmine.createSpy()
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addAction: addActionSpy,
        },
      }))
      mockClock()
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
      expect(stacktrace).toMatch(/^HandlingStack: action\s+at triggerAction @/)
    })
  })

  describe('addError', () => {
    let addErrorSpy: jasmine.Spy<ReturnType<StartRum>['addError']>
    let rumPublicApi: RumPublicApi
    let clock: Clock

    beforeEach(() => {
      mockEventBridge()
      clock = mockClock()
      addErrorSpy = jasmine.createSpy()
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addError: addErrorSpy,
        },
      }))
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
      expect(stacktrace).toMatch(/^HandlingStack: error\s+at triggerError (.|\n)*$/)
    })

    describe('save context when capturing an error', () => {
      it('saves the date', () => {
        clock.tick(ONE_SECOND)
        rumPublicApi.addError(new Error('foo'))

        clock.tick(ONE_SECOND)
        rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].startClocks.relative as number).toEqual(clock.relative(ONE_SECOND))
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addAction: addActionSpy,
        },
      }))
    })

    it('should attach valid objects', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }
      rumPublicApi.setUser(user)

      expect(rumPublicApi.getUser()).toEqual({
        email: 'qux',
        foo: { bar: 'qux' },
        id: 'foo',
        name: 'bar',
      })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should sanitize predefined properties', () => {
      const user = { id: false, name: 2, email: { bar: 'qux' } }
      rumPublicApi.setUser(user as any)
      rumPublicApi.addAction('message')

      expect(rumPublicApi.getUser()).toEqual({
        email: '[object Object]',
        id: 'false',
        name: '2',
      })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should remove the user', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux' }
      rumPublicApi.setUser(user)
      rumPublicApi.clearUser()
      rumPublicApi.addAction('message')

      expect(rumPublicApi.getUser()).toEqual({})
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults())
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults())
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults())
    })

    it('should remove property', () => {
      const user = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }

      rumPublicApi.setUser(user)
      rumPublicApi.removeUserProperty('foo')
      const userClone = rumPublicApi.getUser()
      expect(userClone.foo).toBeUndefined()
    })
  })

  describe('setAccount', () => {
    let addActionSpy: jasmine.Spy<ReturnType<StartRum>['addAction']>
    let displaySpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      addActionSpy = jasmine.createSpy()
      displaySpy = spyOn(display, 'error')
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addAction: addActionSpy,
        },
      }))
    })

    it('should attach valid objects', () => {
      const account = { id: 'foo', name: 'bar', foo: { bar: 'qux' } }
      rumPublicApi.setAccount(account)
      rumPublicApi.addAction('message')

      expect(rumPublicApi.getAccount()).toEqual({
        foo: { bar: 'qux' },
        id: 'foo',
        name: 'bar',
      })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should sanitize predefined properties', () => {
      const account = { id: false, name: 2 }
      rumPublicApi.setAccount(account as any)
      rumPublicApi.addAction('message')

      expect(rumPublicApi.getAccount()).toEqual({
        id: 'false',
        name: '2',
      })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should remove the account', () => {
      const account = { id: 'foo', name: 'bar' }
      rumPublicApi.setAccount(account)
      rumPublicApi.clearAccount()
      rumPublicApi.addAction('message')

      expect(rumPublicApi.getAccount()).toEqual({})
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should reject non object input', () => {
      rumPublicApi.setAccount(2 as any)
      rumPublicApi.setAccount(null as any)
      rumPublicApi.setAccount(undefined as any)
      expect(displaySpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('getAccount', () => {
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults())
    })

    it('should return empty object if no account has been set', () => {
      const accountClone = rumPublicApi.getAccount()
      expect(accountClone).toEqual({})
    })

    it('should return a clone of the original object if set', () => {
      const account = { id: 'foo', name: 'bar', foo: { bar: 'qux' } }
      rumPublicApi.setAccount(account)
      const accountClone = rumPublicApi.getAccount()
      const accountClone2 = rumPublicApi.getAccount()

      expect(accountClone).not.toBe(account)
      expect(accountClone).not.toBe(accountClone2)
      expect(accountClone).toEqual(account)
    })
  })

  describe('setAccountProperty', () => {
    const account = { id: 'foo', name: 'bar', foo: { bar: 'qux' } }
    const addressAttribute = { city: 'Paris' }
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults())
    })

    it('should add attribute', () => {
      rumPublicApi.setAccount(account)
      rumPublicApi.setAccountProperty('address', addressAttribute)
      const accountClone = rumPublicApi.getAccount()

      expect(accountClone.address).toEqual(addressAttribute)
    })

    it('should not contain original reference to object', () => {
      const accountDetails: { [key: string]: any } = { name: 'company' }
      rumPublicApi.setAccount(account)
      rumPublicApi.setAccountProperty('accountDetails', accountDetails)
      const accountClone = rumPublicApi.getAccount()

      expect(accountClone.accountDetails).not.toBe(accountDetails)
    })

    it('should override attribute', () => {
      rumPublicApi.setAccount(account)
      rumPublicApi.setAccountProperty('foo', addressAttribute)
      const accountClone = rumPublicApi.getAccount()

      expect(accountClone).toEqual({ ...account, foo: addressAttribute })
    })

    it('should sanitize properties', () => {
      rumPublicApi.setAccountProperty('id', 123)
      rumPublicApi.setAccountProperty('name', ['My', 'Company'])
      const accountClone = rumPublicApi.getAccount()

      expect(accountClone.id).toEqual('123')
      expect(accountClone.name).toEqual('My,Company')
    })
  })

  describe('removeAccountProperty', () => {
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults())
    })

    it('should remove property', () => {
      const account = { id: 'foo', name: 'bar', email: 'qux', foo: { bar: 'qux' } }

      rumPublicApi.setAccount(account)
      rumPublicApi.removeAccountProperty('foo')
      const accountClone = rumPublicApi.getAccount()
      expect(accountClone.foo).toBeUndefined()
    })
  })

  describe('addTiming', () => {
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let displaySpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      addTimingSpy = jasmine.createSpy()
      displaySpy = spyOn(display, 'error')
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addTiming: addTimingSpy,
        },
      }))
    })

    it('should add custom timings', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addTiming('foo')
      const calls = await collectAsyncCalls(addTimingSpy, 1)

      expect(calls.argsFor(0)[0]).toEqual('foo')
      expect(calls.argsFor(0)[1]).toBeUndefined()
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('adds custom timing with provided time', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addTiming('foo', 12)
      const calls = await collectAsyncCalls(addTimingSpy, 1)

      expect(calls.argsFor(0)[0]).toEqual('foo')
      expect(calls.argsFor(0)[1]).toBe(12 as RelativeTime)
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
        },
      }))
    })

    it('should add feature flag evaluation when ff feature_flags enabled', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addFeatureFlagEvaluation('feature', 'foo')
      const calls = await collectAsyncCalls(addFeatureFlagEvaluationSpy, 1)

      expect(calls.argsFor(0)).toEqual(['feature', 'foo'])
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('stopSession', () => {
    it('calls stopSession on the startRum result', async () => {
      const stopSessionSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          stopSession: stopSessionSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.stopSession()
      await collectAsyncCalls(stopSessionSpy, 1)
      expect(stopSessionSpy).toHaveBeenCalled()
    })
  })

  describe('startView', () => {
    it('should call RUM results startView with the view name', async () => {
      const startViewSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startView: startViewSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startView('foo')
      const calls = await collectAsyncCalls(startViewSpy, 1)
      expect(calls.argsFor(0)[0]).toEqual({ name: 'foo' })
    })

    it('should call RUM results startView with the view options', async () => {
      const startViewSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startView: startViewSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startView({ name: 'foo', service: 'bar', version: 'baz', context: { foo: 'bar' } })
      const calls = await collectAsyncCalls(startViewSpy, 1)
      expect(calls.argsFor(0)[0]).toEqual({
        name: 'foo',
        service: 'bar',
        version: 'baz',
        context: { foo: 'bar' },
      })
    })
  })

  describe('recording', () => {
    let rumPublicApi: RumPublicApi
    let recorderApi: {
      onRumStart: jasmine.Spy<RecorderApi['onRumStart']>
      start: jasmine.Spy
      stop: jasmine.Spy
      getSessionReplayLink: jasmine.Spy
    }

    beforeEach(() => {
      recorderApi = {
        onRumStart: jasmine.createSpy(),
        start: jasmine.createSpy(),
        stop: jasmine.createSpy(),
        getSessionReplayLink: jasmine.createSpy(),
      }
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({ recorderApi }))
    })

    it('is started with the default defaultPrivacyLevel', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      const calls = await collectAsyncCalls(recorderApi.onRumStart, 1)
      expect(calls.mostRecent().args[1].defaultPrivacyLevel).toBe(DefaultPrivacyLevel.MASK)
    })

    it('is started with the configured defaultPrivacyLevel', () => {
      rumPublicApi.init({
        ...DEFAULT_INIT_CONFIGURATION,
        defaultPrivacyLevel: DefaultPrivacyLevel.MASK_USER_INPUT,
      })
      expect(recorderApi.onRumStart.calls.mostRecent().args[1].defaultPrivacyLevel).toBe(
        DefaultPrivacyLevel.MASK_USER_INPUT
      )
    })

    it('public api calls are forwarded to the recorder api', () => {
      rumPublicApi.startSessionReplayRecording()
      rumPublicApi.stopSessionReplayRecording()
      rumPublicApi.getSessionReplayLink()

      expect(recorderApi.start).toHaveBeenCalledTimes(1)
      expect(recorderApi.stop).toHaveBeenCalledTimes(1)
      expect(recorderApi.getSessionReplayLink).toHaveBeenCalledTimes(1)
    })

    it('is started with the default startSessionReplayRecordingManually', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      const calls = await collectAsyncCalls(recorderApi.onRumStart, 1)
      expect(calls.mostRecent().args[1].startSessionReplayRecordingManually).toBe(true)
    })

    it('is started with the configured startSessionReplayRecordingManually', async () => {
      rumPublicApi.init({
        ...DEFAULT_INIT_CONFIGURATION,
        startSessionReplayRecordingManually: false,
      })
      const calls = await collectAsyncCalls(recorderApi.onRumStart, 1)
      expect(calls.mostRecent().args[1].startSessionReplayRecordingManually).toBe(false)
    })
  })

  describe('startDurationVital', () => {
    it('should call startDurationVital on the startRum result', async () => {
      const startDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startDurationVital: startDurationVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      await collectAsyncCalls(startDurationVitalSpy, 1)
      expect(startDurationVitalSpy).toHaveBeenCalledWith('foo', {
        description: 'description-value',
        context: { foo: 'bar' },
      })
    })
  })

  describe('stopDurationVital', () => {
    it('should call stopDurationVital with a name on the startRum result', async () => {
      const stopDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          stopDurationVital: stopDurationVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      rumPublicApi.stopDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      await collectAsyncCalls(stopDurationVitalSpy, 1)
      expect(stopDurationVitalSpy).toHaveBeenCalledWith('foo', {
        description: 'description-value',
        context: { foo: 'bar' },
      })
    })

    it('should call stopDurationVital with a reference on the startRum result', async () => {
      const stopDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          stopDurationVital: stopDurationVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      const ref = rumPublicApi.startDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      rumPublicApi.stopDurationVital(ref, { context: { foo: 'bar' }, description: 'description-value' })
      await collectAsyncCalls(stopDurationVitalSpy, 1)
      expect(stopDurationVitalSpy).toHaveBeenCalledWith(ref, {
        description: 'description-value',
        context: { foo: 'bar' },
      })
    })
  })

  describe('startAction / stopAction', () => {
    it('should call startAction and stopAction on the strategy', () => {
      mockExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])

      const startActionSpy = jasmine.createSpy()
      const stopActionSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startAction: startActionSpy,
          stopAction: stopActionSpy,
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startAction('purchase', {
        type: ActionType.CUSTOM,
        context: { cart: 'abc' },
      })
      rumPublicApi.stopAction('purchase', {
        context: { total: 100 },
      })

      expect(startActionSpy).toHaveBeenCalledWith(
        'purchase',
        jasmine.objectContaining({
          type: ActionType.CUSTOM,
          context: { cart: 'abc' },
        })
      )
      expect(stopActionSpy).toHaveBeenCalledWith(
        'purchase',
        jasmine.objectContaining({
          context: { total: 100 },
        })
      )
    })

    it('should sanitize startAction and stopAction inputs', () => {
      mockExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])

      const startActionSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startAction: startActionSpy,
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startAction('action_name', {
        type: ActionType.CUSTOM,
        context: { count: 123, nested: { foo: 'bar' } } as any,
        actionKey: 'action_key',
      })

      expect(startActionSpy.calls.argsFor(0)[1]).toEqual(
        jasmine.objectContaining({
          type: ActionType.CUSTOM,
          context: { count: 123, nested: { foo: 'bar' } },
          actionKey: 'action_key',
        })
      )
    })

    it('should not call startAction/stopAction when feature flag is disabled', () => {
      const startActionSpy = jasmine.createSpy()
      const stopActionSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startAction: startActionSpy,
          stopAction: stopActionSpy,
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startAction('purchase', { type: ActionType.CUSTOM })
      rumPublicApi.stopAction('purchase')

      expect(startActionSpy).not.toHaveBeenCalled()
      expect(stopActionSpy).not.toHaveBeenCalled()
    })
  })

  describe('addDurationVital', () => {
    it('should call addDurationVital on the startRum result', async () => {
      const addDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addDurationVital: addDurationVitalSpy,
        },
      })
      const startTime = 1707755888000 as TimeStamp
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addDurationVital('foo', {
        startTime,
        duration: 100,
        context: { foo: 'bar' },
        description: 'description-value',
      })
      await collectAsyncCalls(addDurationVitalSpy, 1)
      expect(addDurationVitalSpy).toHaveBeenCalledWith({
        name: 'foo',
        startClocks: timeStampToClocks(startTime),
        duration: 100,
        context: { foo: 'bar' },
        description: 'description-value',
        type: VitalType.DURATION,
      })
    })
  })

  describe('startFeatureOperation', () => {
    it('should call addOperationStepVital on the startRum result with start status', async () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addOperationStepVital: addOperationStepVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startFeatureOperation('foo', { operationKey: '00000000-0000-0000-0000-000000000000' })
      await collectAsyncCalls(addOperationStepVitalSpy, 1)
      expect(addOperationStepVitalSpy).toHaveBeenCalledWith('foo', 'start', {
        operationKey: '00000000-0000-0000-0000-000000000000',
      })
    })
  })

  describe('succeedFeatureOperation', () => {
    it('should call addOperationStepVital on the startRum result with end status', async () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addOperationStepVital: addOperationStepVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.succeedFeatureOperation('foo', { operationKey: '00000000-0000-0000-0000-000000000000' })
      await collectAsyncCalls(addOperationStepVitalSpy, 1)
      expect(addOperationStepVitalSpy).toHaveBeenCalledWith('foo', 'end', {
        operationKey: '00000000-0000-0000-0000-000000000000',
      })
    })
  })

  describe('failFeatureOperation', () => {
    it('should call addOperationStepVital on the startRum result with end status and failure reason', async () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addOperationStepVital: addOperationStepVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.failFeatureOperation('foo', 'error', { operationKey: '00000000-0000-0000-0000-000000000000' })
      await collectAsyncCalls(addOperationStepVitalSpy, 1)
      expect(addOperationStepVitalSpy).toHaveBeenCalledWith(
        'foo',
        'end',
        { operationKey: '00000000-0000-0000-0000-000000000000' },
        'error'
      )
    })
  })

  it('should provide sdk version', () => {
    const { rumPublicApi } = makeRumPublicApiWithDefaults()
    expect(rumPublicApi.version).toBe('test')
  })

  describe('setViewName', () => {
    let setViewNameSpy: jasmine.Spy<ReturnType<StartRum>['setViewName']>
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      setViewNameSpy = jasmine.createSpy()
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          setViewName: setViewNameSpy,
        },
      }))
    })

    it('should set the view name', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.setViewName('foo')
      await collectAsyncCalls(setViewNameSpy, 1)

      expect(setViewNameSpy).toHaveBeenCalledWith('foo')
    })
  })

  describe('set view specific context', () => {
    let rumPublicApi: RumPublicApi
    let setViewContextSpy: jasmine.Spy<ReturnType<StartRum>['setViewContext']>
    let setViewContextPropertySpy: jasmine.Spy<ReturnType<StartRum>['setViewContextProperty']>

    beforeEach(() => {
      setViewContextSpy = jasmine.createSpy()
      setViewContextPropertySpy = jasmine.createSpy()
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          setViewContext: setViewContextSpy,
          setViewContextProperty: setViewContextPropertySpy,
        },
      }))
    })

    it('should set view specific context with setViewContext', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      /* eslint-disable @typescript-eslint/no-unsafe-call */
      ;(rumPublicApi as any).setViewContext({ foo: 'bar' })
      await collectAsyncCalls(setViewContextSpy, 1)

      expect(setViewContextSpy).toHaveBeenCalledWith({ foo: 'bar' })
    })

    it('should set view specific context with setViewContextProperty', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      /* eslint-disable @typescript-eslint/no-unsafe-call */
      ;(rumPublicApi as any).setViewContextProperty('foo', 'bar')
      await collectAsyncCalls(setViewContextPropertySpy, 1)

      expect(setViewContextPropertySpy).toHaveBeenCalledWith('foo', 'bar')
    })
  })

  describe('getViewContext', () => {
    let getViewContextSpy: jasmine.Spy<ReturnType<StartRum>['getViewContext']>
    let rumPublicApi: RumPublicApi
    let startRumSpy: jasmine.Spy<StartRum>

    beforeEach(() => {
      getViewContextSpy = jasmine.createSpy().and.callFake(() => ({
        foo: 'bar',
      }))
      ;({ rumPublicApi, startRumSpy } = makeRumPublicApiWithDefaults({
        startRumResult: {
          getViewContext: getViewContextSpy,
        },
      }))
    })

    it('should return the view context after init', async () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      await collectAsyncCalls(startRumSpy, 1)

      expect(rumPublicApi.getViewContext()).toEqual({ foo: 'bar' })
      expect(getViewContextSpy).toHaveBeenCalled()
    })

    it('should return an empty object before init', () => {
      expect(rumPublicApi.getViewContext()).toEqual({})
      expect(getViewContextSpy).not.toHaveBeenCalled()
    })
  })

  describe('it should pass down the sdk name to startRum', () => {
    it('should return the sdk name', async () => {
      const { rumPublicApi, startRumSpy } = makeRumPublicApiWithDefaults({
        rumPublicApiOptions: {
          sdkName: 'rum-slim',
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      const calls = await collectAsyncCalls(startRumSpy, 1)
      const sdkName = calls.argsFor(0)[11]
      expect(sdkName).toBe('rum-slim')
    })
  })
})

function makeRumPublicApiWithDefaults({
  recorderApi,
  profilerApi,
  startRumResult,
  rumPublicApiOptions = {},
}: {
  recorderApi?: Partial<RecorderApi>
  profilerApi?: Partial<ProfilerApi>
  startRumResult?: Partial<ReturnType<StartRum>>
  rumPublicApiOptions?: RumPublicApiOptions
} = {}) {
  const startRumSpy = jasmine.createSpy<StartRum>().and.callFake(() => ({
    ...noopStartRum(),
    ...startRumResult,
  }))
  return {
    startRumSpy,
    rumPublicApi: makeRumPublicApi(
      startRumSpy,
      { ...noopRecorderApi, ...recorderApi },
      { ...noopProfilerApi, ...profilerApi },
      rumPublicApiOptions,
      createFakeTelemetryObject
    ),
  }
}
