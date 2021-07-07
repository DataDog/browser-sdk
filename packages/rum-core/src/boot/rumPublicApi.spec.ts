import { ErrorSource, ONE_SECOND, RelativeTime, getTimeStamp, display, TimeStamp } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { ActionType } from '../rawRumEvent.types'
import { makeRumPublicApi, RumPublicApi, RumInitConfiguration, StartRum } from './rumPublicApi'

const noopStartRum = (): ReturnType<StartRum> => ({
  addAction: () => undefined,
  addError: () => undefined,
  addTiming: () => undefined,
  startView: () => undefined,
  getInternalContext: () => undefined,
  lifeCycle: {} as any,
  parentContexts: {} as any,
  session: {} as any,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('rum public api', () => {
  describe('configuration validation', () => {
    let rumPublicApi: RumPublicApi
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      rumPublicApi = makeRumPublicApi(noopStartRum)
    })

    it('init should log an error with no application id', () => {
      const invalidConfiguration = { clientToken: 'yes' }
      rumPublicApi.init(invalidConfiguration as RumInitConfiguration)
      expect(display.error).toHaveBeenCalledTimes(1)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes' })
      expect(displaySpy).toHaveBeenCalledTimes(1)
    })

    it('init should log an error if sampleRate is invalid', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 'foo' as any })
      expect(displaySpy).toHaveBeenCalledTimes(1)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 200 })
      expect(displaySpy).toHaveBeenCalledTimes(2)
    })

    it('init should log an error if resourceSampleRate is invalid', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 'foo' as any })
      expect(displaySpy).toHaveBeenCalledTimes(1)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 200 })
      expect(displaySpy).toHaveBeenCalledTimes(2)
    })

    it('should log an error if init is called several times', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(displaySpy).toHaveBeenCalledTimes(0)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(displaySpy).toHaveBeenCalledTimes(1)
    })

    it('should log an error if tracing is enabled without a service configured', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', allowedTracingOrigins: [] })
      expect(displaySpy).toHaveBeenCalledTimes(0)

      makeRumPublicApi(noopStartRum).init({
        allowedTracingOrigins: ['foo.bar'],
        applicationId: 'yes',
        clientToken: 'yes',
        service: 'foo',
      })
      expect(displaySpy).toHaveBeenCalledTimes(0)

      makeRumPublicApi(noopStartRum).init({
        allowedTracingOrigins: ['foo.bar'],
        applicationId: 'yes',
        clientToken: 'yes',
      })
      expect(displaySpy).toHaveBeenCalledTimes(1)
    })

    it('should not log an error if init is called several times and silentMultipleInit is true', () => {
      rumPublicApi.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(displaySpy).toHaveBeenCalledTimes(0)

      rumPublicApi.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(displaySpy).toHaveBeenCalledTimes(0)
    })

    it("shouldn't trigger any console.error if the configuration is correct", () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(displaySpy).toHaveBeenCalledTimes(0)
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
      rumPublicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        getInternalContext: getInternalContextSpy,
      }))
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

    beforeEach(() => {
      rumPublicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
      }))
    })

    it('returns undefined before init', () => {
      expect(rumPublicApi.getInitConfiguration()).toBe(undefined)
    })

    it('returns the user configuration after init', () => {
      const initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'my-service', version: '1.4.2', env: 'dev' }
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
      rumPublicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addAction: addActionSpy,
      }))
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
        { context: {}, user: {} },
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
        rumPublicApi.addRumGlobalContext('foo', 'bar')
        rumPublicApi.addAction('message')
        rumPublicApi.addRumGlobalContext('foo', 'baz')

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
      rumPublicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addError: addErrorSpy,
      }))
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
          source: ErrorSource.CUSTOM,
          startClocks: jasmine.any(Object),
        },
        { context: {}, user: {} },
      ])
    })

    it('allows setting an ErrorSource', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addError(new Error('foo'), undefined, ErrorSource.SOURCE)
      expect(addErrorSpy.calls.argsFor(0)[0].source).toBe(ErrorSource.SOURCE)
    })

    it('fallbacks to ErrorSource.CUSTOM if an invalid source is given', () => {
      const displaySpy = spyOn(display, 'error')
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addError(new Error('foo'), undefined, 'invalid' as any)
      expect(addErrorSpy.calls.argsFor(0)[0].source).toBe(ErrorSource.CUSTOM)
      expect(displaySpy).toHaveBeenCalledWith("DD_RUM.addError: Invalid source 'invalid'")
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
        rumPublicApi.addRumGlobalContext('foo', 'bar')
        rumPublicApi.addError(new Error('message'))
        rumPublicApi.addRumGlobalContext('foo', 'baz')

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
      rumPublicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addAction: addActionSpy,
      }))
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
      rumPublicApi.removeUser()
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

  describe('addTiming', () => {
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let displaySpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addTimingSpy = jasmine.createSpy()
      displaySpy = spyOn(display, 'error')
      rumPublicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addTiming: addTimingSpy,
      }))
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
  })

  describe('trackViews mode', () => {
    const AUTO_CONFIGURATION = { ...DEFAULT_INIT_CONFIGURATION }
    const MANUAL_CONFIGURATION = { ...AUTO_CONFIGURATION, trackViewsManually: true }

    let startRumSpy: jasmine.Spy<StartRum>
    let startViewSpy: jasmine.Spy<ReturnType<StartRum>['startView']>
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let displaySpy: jasmine.Spy<() => void>
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
      rumPublicApi = makeRumPublicApi(startRumSpy)
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    describe('when auto', () => {
      it('should start rum at init', () => {
        rumPublicApi.init(AUTO_CONFIGURATION)

        expect(startRumSpy).toHaveBeenCalled()
      })

      it('before init startView should be handled after init', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(10)
        rumPublicApi.startView('foo')

        expect(startViewSpy).not.toHaveBeenCalled()

        clock.tick(20)
        rumPublicApi.init(AUTO_CONFIGURATION)

        expect(startViewSpy).toHaveBeenCalled()
        expect(startViewSpy.calls.argsFor(0)[0]).toEqual('foo')
        expect(startViewSpy.calls.argsFor(0)[1]).toEqual({
          relative: 10 as RelativeTime,
          timeStamp: (jasmine.any(Number) as unknown) as TimeStamp,
        })
      })

      it('after init startView should be handle immediately', () => {
        rumPublicApi.init(AUTO_CONFIGURATION)

        rumPublicApi.startView('foo')

        expect(startViewSpy).toHaveBeenCalled()
        expect(startViewSpy.calls.argsFor(0)[0]).toEqual('foo')
        expect(startViewSpy.calls.argsFor(0)[1]).toBeUndefined()
        expect(displaySpy).not.toHaveBeenCalled()
      })
    })

    describe('when views are tracked manually', () => {
      it('should not start rum at init', () => {
        rumPublicApi.init(MANUAL_CONFIGURATION)

        expect(startRumSpy).not.toHaveBeenCalled()
      })

      it('before init startView should start rum', () => {
        rumPublicApi.startView('foo')
        expect(startRumSpy).not.toHaveBeenCalled()
        expect(startViewSpy).not.toHaveBeenCalled()

        rumPublicApi.init(MANUAL_CONFIGURATION)
        expect(startRumSpy).toHaveBeenCalled()
        expect(startRumSpy.calls.argsFor(0)[4]).toEqual('foo')
        expect(startViewSpy).not.toHaveBeenCalled()
      })

      it('after init startView should start rum', () => {
        rumPublicApi.init(MANUAL_CONFIGURATION)
        expect(startRumSpy).not.toHaveBeenCalled()
        expect(startViewSpy).not.toHaveBeenCalled()

        rumPublicApi.startView('foo')
        expect(startRumSpy).toHaveBeenCalled()
        expect(startRumSpy.calls.argsFor(0)[4]).toEqual('foo')
        expect(startViewSpy).not.toHaveBeenCalled()
      })

      it('after start rum startView should start view', () => {
        rumPublicApi.init(MANUAL_CONFIGURATION)
        rumPublicApi.startView('foo')
        rumPublicApi.startView('bar')

        expect(startRumSpy).toHaveBeenCalled()
        expect(startRumSpy.calls.argsFor(0)[4]).toEqual('foo')
        expect(startViewSpy).toHaveBeenCalled()
        expect(startViewSpy.calls.argsFor(0)[0]).toEqual('bar')
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
})
