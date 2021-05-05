import { ErrorSource, ONE_SECOND, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { ActionType } from '../rawRumEvent.types'
import { makeRumPublicApi, RumPublicApi, RumUserConfiguration, StartRum } from './rumPublicApi'

const noopStartRum = (): ReturnType<StartRum> => ({
  addAction: () => undefined,
  addError: () => undefined,
  addTiming: () => undefined,
  configuration: {} as any,
  getInternalContext: () => undefined,
  lifeCycle: {} as any,
  parentContexts: {} as any,
  session: {} as any,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('rum public api', () => {
  describe('configuration validation', () => {
    let rumPublicApi: RumPublicApi
    let errorSpy: jasmine.Spy

    beforeEach(() => {
      errorSpy = spyOn(console, 'error')
      rumPublicApi = makeRumPublicApi(noopStartRum)
    })

    it('init should log an error with no application id', () => {
      const invalidConfiguration = { clientToken: 'yes' }
      rumPublicApi.init(invalidConfiguration as RumUserConfiguration)
      expect(console.error).toHaveBeenCalledTimes(1)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes' })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('init should log an error if sampleRate is invalid', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('init should log an error if resourceSampleRate is invalid', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('should log an error if init is called several times', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should log an error if tracing is enabled without a service configured', () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', allowedTracingOrigins: [] })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      makeRumPublicApi(noopStartRum).init({
        allowedTracingOrigins: ['foo.bar'],
        applicationId: 'yes',
        clientToken: 'yes',
        service: 'foo',
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      makeRumPublicApi(noopStartRum).init({
        allowedTracingOrigins: ['foo.bar'],
        applicationId: 'yes',
        clientToken: 'yes',
      })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should not log an error if init is called several times and silentMultipleInit is true', () => {
      rumPublicApi.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      rumPublicApi.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it("shouldn't trigger any console.log if the configuration is correct", () => {
      rumPublicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)
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
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => false)
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
          inForeground: false,
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
      const consoleSpy = spyOn(console, 'error')
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumPublicApi.addError(new Error('foo'), undefined, 'invalid' as any)
      expect(addErrorSpy.calls.argsFor(0)[0].source).toBe(ErrorSource.CUSTOM)
      expect(consoleSpy).toHaveBeenCalledWith("DD_RUM.addError: Invalid source 'invalid'")
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
    let errorSpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addActionSpy = jasmine.createSpy()
      errorSpy = spyOn(console, 'error')
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
      expect(errorSpy).not.toHaveBeenCalled()
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
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should reject non object input', () => {
      rumPublicApi.setUser(2 as any)
      rumPublicApi.setUser(null as any)
      rumPublicApi.setUser(undefined as any)
      expect(errorSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('addTiming', () => {
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let errorSpy: jasmine.Spy<() => void>
    let rumPublicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addTimingSpy = jasmine.createSpy()
      errorSpy = spyOn(console, 'error')
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
      expect(addTimingSpy.calls.argsFor(0)[1]).toEqual({
        relative: 10 as RelativeTime,
        timeStamp: (jasmine.any(Number) as unknown) as TimeStamp,
      })
    })

    it('should add custom timings', () => {
      rumPublicApi.init(DEFAULT_INIT_CONFIGURATION)

      rumPublicApi.addTiming('foo')

      expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('foo')
      expect(addTimingSpy.calls.argsFor(0)[1]).toBeUndefined()
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
