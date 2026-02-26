import type { RelativeTime, DeflateWorker, TimeStamp } from '@datadog/browser-core'
import {
  ONE_SECOND,
  display,
  DefaultPrivacyLevel,
  timeStampToClocks,
  ExperimentalFeature,
  ResourceType,
  startTelemetry,
  addExperimentalFeatures,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createFakeTelemetryObject, mockClock, replaceMockableWithSpy } from '@datadog/browser-core/test'
import { noopRecorderApi, noopProfilerApi } from '../../test'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { DurationVitalReference } from '../domain/vital/vitalCollection'
import type { RumPublicApi, RecorderApi, ProfilerApi, RumPublicApiOptions } from './rumPublicApi'
import { makeRumPublicApi } from './rumPublicApi'
import type { StartRum } from './startRum'
import { startRum } from './startRum'

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
  session: {} as any,
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
  startResource: () => undefined,
  stopResource: () => undefined,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }
const FAKE_WORKER = {} as DeflateWorker

describe('rum public api', () => {
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

      it('pass the worker to the recorder API', () => {
        rumPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          compressIntakeRequests: true,
        })
        expect(recorderApiOnRumStartSpy.calls.mostRecent().args[4]).toBe(FAKE_WORKER)
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          getInternalContext: getInternalContextSpy,
        },
      }))
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
      addErrorSpy = jasmine.createSpy()
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addError: addErrorSpy,
        },
      }))
      clock = mockClock()
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
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addFeatureFlagEvaluation: addFeatureFlagEvaluationSpy,
        },
      }))
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
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          stopSession: stopSessionSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.stopSession()
      expect(stopSessionSpy).toHaveBeenCalled()
    })
  })

  describe('startView', () => {
    it('should call RUM results startView with the view name', () => {
      const startViewSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startView: startViewSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startView('foo')
      expect(startViewSpy.calls.argsFor(0)[0]).toEqual({ name: 'foo', handlingStack: jasmine.any(String) })
    })

    it('should call RUM results startView with the view options', () => {
      const startViewSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startView: startViewSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startView({ name: 'foo', service: 'bar', version: 'baz', context: { foo: 'bar' } })
      expect(startViewSpy.calls.argsFor(0)[0]).toEqual({
        name: 'foo',
        service: 'bar',
        version: 'baz',
        context: { foo: 'bar' },
        handlingStack: jasmine.any(String),
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

    it('is started with the default defaultPrivacyLevel', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApi.onRumStart.calls.mostRecent().args[1].defaultPrivacyLevel).toBe(DefaultPrivacyLevel.MASK)
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

    it('is started with the default startSessionReplayRecordingManually', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApi.onRumStart.calls.mostRecent().args[1].startSessionReplayRecordingManually).toBe(true)
    })

    it('is started with the configured startSessionReplayRecordingManually', () => {
      rumPublicApi.init({
        ...DEFAULT_INIT_CONFIGURATION,
        startSessionReplayRecordingManually: false,
      })
      expect(recorderApi.onRumStart.calls.mostRecent().args[1].startSessionReplayRecordingManually).toBe(false)
    })
  })

  describe('startDurationVital', () => {
    it('should call startDurationVital on the startRum result', () => {
      const startDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startDurationVital: startDurationVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      expect(startDurationVitalSpy).toHaveBeenCalledWith('foo', {
        description: 'description-value',
        context: { foo: 'bar' },
        handlingStack: jasmine.any(String),
      })
    })
  })

  describe('stopDurationVital', () => {
    it('should call stopDurationVital with a name on the startRum result', () => {
      const stopDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          stopDurationVital: stopDurationVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      rumPublicApi.stopDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      expect(stopDurationVitalSpy).toHaveBeenCalledWith('foo', {
        description: 'description-value',
        context: { foo: 'bar' },
      })
    })

    it('should call stopDurationVital with a reference on the startRum result', () => {
      const stopDurationVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          stopDurationVital: stopDurationVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      const ref = rumPublicApi.startDurationVital('foo', { context: { foo: 'bar' }, description: 'description-value' })
      rumPublicApi.stopDurationVital(ref, { context: { foo: 'bar' }, description: 'description-value' })
      expect(stopDurationVitalSpy).toHaveBeenCalledWith(ref, {
        description: 'description-value',
        context: { foo: 'bar' },
      })
    })
  })

  describe('startAction / stopAction', () => {
    it('should call startAction and stopAction on the strategy', () => {
      addExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])

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
      addExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])

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

  describe('startResource / stopResource', () => {
    it('should call startResource and stopResource on the strategy', () => {
      addExperimentalFeatures([ExperimentalFeature.START_STOP_RESOURCE])

      const startResourceSpy = jasmine.createSpy()
      const stopResourceSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startResource: startResourceSpy,
          stopResource: stopResourceSpy,
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startResource('https://api.example.com/data', {
        type: ResourceType.FETCH,
        method: 'POST',
        context: { requestId: 'abc' },
      })
      rumPublicApi.stopResource('https://api.example.com/data', {
        type: ResourceType.XHR,
        statusCode: 200,
        context: { responseSize: 1024 },
      })

      expect(startResourceSpy).toHaveBeenCalledWith(
        'https://api.example.com/data',
        jasmine.objectContaining({
          type: ResourceType.FETCH,
          method: 'POST',
          context: { requestId: 'abc' },
        })
      )
      expect(stopResourceSpy).toHaveBeenCalledWith(
        'https://api.example.com/data',
        jasmine.objectContaining({
          type: ResourceType.XHR,
          statusCode: 200,
          context: { responseSize: 1024 },
        })
      )
    })

    it('should sanitize startResource and stopResource inputs', () => {
      addExperimentalFeatures([ExperimentalFeature.START_STOP_RESOURCE])

      const startResourceSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startResource: startResourceSpy,
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startResource('https://api.example.com/data', {
        type: ResourceType.XHR,
        method: 'GET',
        context: { count: 123, nested: { foo: 'bar' } } as any,
        resourceKey: 'resource_key',
      })

      expect(startResourceSpy.calls.argsFor(0)[1]).toEqual(
        jasmine.objectContaining({
          type: ResourceType.XHR,
          method: 'GET',
          context: { count: 123, nested: { foo: 'bar' } },
          resourceKey: 'resource_key',
        })
      )
    })

    it('should not call startResource/stopResource when feature flag is disabled', () => {
      const startResourceSpy = jasmine.createSpy()
      const stopResourceSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          startResource: startResourceSpy,
          stopResource: stopResourceSpy,
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startResource('https://api.example.com/data', { type: ResourceType.FETCH })
      rumPublicApi.stopResource('https://api.example.com/data')

      expect(startResourceSpy).not.toHaveBeenCalled()
      expect(stopResourceSpy).not.toHaveBeenCalled()
    })
  })

  describe('addDurationVital', () => {
    it('should call addDurationVital on the startRum result', () => {
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
      expect(addDurationVitalSpy).toHaveBeenCalledWith({
        name: 'foo',
        startClocks: timeStampToClocks(startTime),
        duration: 100,
        context: { foo: 'bar' },
        description: 'description-value',
        handlingStack: jasmine.any(String),
        type: VitalType.DURATION,
      })
    })
  })

  describe('startFeatureOperation', () => {
    it('should call addOperationStepVital on the startRum result with start status', () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addOperationStepVital: addOperationStepVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.startFeatureOperation('foo', { operationKey: '00000000-0000-0000-0000-000000000000' })
      expect(addOperationStepVitalSpy).toHaveBeenCalledWith('foo', 'start', {
        operationKey: '00000000-0000-0000-0000-000000000000',
      })
    })
  })

  describe('succeedFeatureOperation', () => {
    it('should call addOperationStepVital on the startRum result with end status', () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addOperationStepVital: addOperationStepVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.succeedFeatureOperation('foo', { operationKey: '00000000-0000-0000-0000-000000000000' })
      expect(addOperationStepVitalSpy).toHaveBeenCalledWith('foo', 'end', {
        operationKey: '00000000-0000-0000-0000-000000000000',
      })
    })
  })

  describe('failFeatureOperation', () => {
    it('should call addOperationStepVital on the startRum result with end status and failure reason', () => {
      const addOperationStepVitalSpy = jasmine.createSpy()
      const { rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          addOperationStepVital: addOperationStepVitalSpy,
        },
      })
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.failFeatureOperation('foo', 'error', { operationKey: '00000000-0000-0000-0000-000000000000' })
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

    it('should set the view name', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.setViewName('foo')

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

    it('should set view specific context with setViewContext', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      /* eslint-disable @typescript-eslint/no-unsafe-call */
      ;(rumPublicApi as any).setViewContext({ foo: 'bar' })

      expect(setViewContextSpy).toHaveBeenCalledWith({ foo: 'bar' })
    })

    it('should set view specific context with setViewContextProperty', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      /* eslint-disable @typescript-eslint/no-unsafe-call */
      ;(rumPublicApi as any).setViewContextProperty('foo', 'bar')

      expect(setViewContextPropertySpy).toHaveBeenCalledWith('foo', 'bar')
    })
  })

  describe('getViewContext', () => {
    let getViewContextSpy: jasmine.Spy<ReturnType<StartRum>['getViewContext']>
    let rumPublicApi: RumPublicApi

    beforeEach(() => {
      getViewContextSpy = jasmine.createSpy().and.callFake(() => ({
        foo: 'bar',
      }))
      ;({ rumPublicApi } = makeRumPublicApiWithDefaults({
        startRumResult: {
          getViewContext: getViewContextSpy,
        },
      }))
    })

    it('should return the view context after init', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(rumPublicApi.getViewContext()).toEqual({ foo: 'bar' })
      expect(getViewContextSpy).toHaveBeenCalled()
    })

    it('should return an empty object before init', () => {
      expect(rumPublicApi.getViewContext()).toEqual({})
      expect(getViewContextSpy).not.toHaveBeenCalled()
    })
  })

  describe('it should pass down the sdk name to startRum', () => {
    it('should return the sdk name', () => {
      const { rumPublicApi, startRumSpy } = makeRumPublicApiWithDefaults({
        rumPublicApiOptions: {
          sdkName: 'rum-slim',
        },
      })

      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      const sdkName = startRumSpy.calls.argsFor(0)[10]
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
  const startRumSpy = replaceMockableWithSpy(startRum).and.callFake(() => ({
    ...noopStartRum(),
    ...startRumResult,
  }))
  replaceMockableWithSpy(startTelemetry).and.callFake(createFakeTelemetryObject)
  return {
    startRumSpy,
    rumPublicApi: makeRumPublicApi(
      { ...noopRecorderApi, ...recorderApi },
      { ...noopProfilerApi, ...profilerApi },
      rumPublicApiOptions
    ),
  }
}
