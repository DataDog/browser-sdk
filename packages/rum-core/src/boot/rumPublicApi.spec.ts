import { Configuration, ErrorSource, ONE_SECOND } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { ActionType } from '../domain/rumEventsCollection/action/trackActions'
import { makeRumPublicApi, RumPublicApi, RumUserConfiguration, StartRum } from './rumPublicApi'

const configuration: Partial<Configuration> = {
  isEnabled: () => false,
}
const noopStartRum = () => ({
  addAction: () => undefined,
  addError: () => undefined,
  addTiming: () => undefined,
  configuration: configuration as Configuration,
  getInternalContext: () => undefined,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('rum entry', () => {
  describe('configuration validation', () => {
    let publicApi: RumPublicApi
    let errorSpy: jasmine.Spy

    beforeEach(() => {
      errorSpy = spyOn(console, 'error')
      publicApi = makeRumPublicApi(noopStartRum)
    })

    it('init should log an error with no application id', () => {
      const invalidConfiguration = { clientToken: 'yes' }
      publicApi.init(invalidConfiguration as RumUserConfiguration)
      expect(console.error).toHaveBeenCalledTimes(1)

      publicApi.init({ clientToken: 'yes', applicationId: 'yes' })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('init should log an error if sampleRate is invalid', () => {
      publicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      publicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('init should log an error if resourceSampleRate is invalid', () => {
      publicApi.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      publicApi.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('should log an error if init is called several times', () => {
      publicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      publicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should log an error if tracing is enabled without a service configured', () => {
      publicApi.init({ clientToken: 'yes', applicationId: 'yes', allowedTracingOrigins: [] })
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
      publicApi.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      publicApi.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it("shouldn't trigger any console.log if the configuration is correct", () => {
      publicApi.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('getInternalContext', () => {
    let getInternalContextSpy: jasmine.Spy<ReturnType<StartRum>['getInternalContext']>
    let publicApi: RumPublicApi

    beforeEach(() => {
      getInternalContextSpy = jasmine.createSpy().and.callFake(() => ({
        application_id: '123',
        session_id: '123',
      }))
      publicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        getInternalContext: getInternalContextSpy,
      }))
    })

    it('returns undefined before init', () => {
      expect(publicApi.getInternalContext()).toBe(undefined)
      expect(getInternalContextSpy).not.toHaveBeenCalled()
    })

    it('returns the internal context after init', () => {
      publicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(publicApi.getInternalContext()).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalled()
    })

    it('uses the startTime if specified', () => {
      publicApi.init(DEFAULT_INIT_CONFIGURATION)

      const startTime = 234832890
      expect(publicApi.getInternalContext(startTime)).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalledWith(startTime)
    })
  })

  describe('addAction', () => {
    let addActionSpy: jasmine.Spy<ReturnType<StartRum>['addAction']>
    let publicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addActionSpy = jasmine.createSpy()
      publicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addAction: addActionSpy,
      }))
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('allows sending actions before init', () => {
      publicApi.addAction('foo', { bar: 'baz' })

      expect(addActionSpy).not.toHaveBeenCalled()
      publicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy).toHaveBeenCalledTimes(1)
      expect(addActionSpy.calls.argsFor(0)).toEqual([
        {
          context: { bar: 'baz' },
          name: 'foo',
          startTime: jasmine.any(Number),
          type: ActionType.CUSTOM,
        },
        { context: {}, user: {} },
      ])
    })

    describe('save context when sending an action', () => {
      it('saves the date', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(ONE_SECOND)
        publicApi.addAction('foo')

        clock.tick(ONE_SECOND)
        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[0].startTime).toEqual(ONE_SECOND)
      })

      it('stores a deep copy of the global context', () => {
        publicApi.addRumGlobalContext('foo', 'bar')
        publicApi.addAction('message')
        publicApi.addRumGlobalContext('foo', 'baz')

        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[1]!.context).toEqual({
          foo: 'bar',
        })
      })

      it('stores a deep copy of the user', () => {
        const user = { id: 'foo' }
        publicApi.setUser(user)
        publicApi.addAction('message')
        user.id = 'bar'

        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({
          id: 'foo',
        })
      })

      it('stores a deep copy of the action context', () => {
        const context = { foo: 'bar' }
        publicApi.addAction('message', context)
        context.foo = 'baz'

        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addActionSpy.calls.argsFor(0)[0].context).toEqual({
          foo: 'bar',
        })
      })
    })
  })

  describe('addError', () => {
    let addErrorSpy: jasmine.Spy<ReturnType<StartRum>['addError']>
    let publicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addErrorSpy = jasmine.createSpy()
      publicApi = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addError: addErrorSpy,
      }))
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('allows capturing an error before init', () => {
      publicApi.addError(new Error('foo'))

      expect(addErrorSpy).not.toHaveBeenCalled()
      publicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addErrorSpy).toHaveBeenCalledTimes(1)
      expect(addErrorSpy.calls.argsFor(0)).toEqual([
        {
          context: undefined,
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: jasmine.any(Number),
        },
        { context: {}, user: {} },
      ])
    })

    it('allows setting an ErrorSource', () => {
      publicApi.init(DEFAULT_INIT_CONFIGURATION)
      publicApi.addError(new Error('foo'), undefined, ErrorSource.SOURCE)
      expect(addErrorSpy.calls.argsFor(0)[0].source).toBe(ErrorSource.SOURCE)
    })

    it('fallbacks to ErrorSource.CUSTOM if an invalid source is given', () => {
      const consoleSpy = spyOn(console, 'error')
      publicApi.init(DEFAULT_INIT_CONFIGURATION)
      publicApi.addError(new Error('foo'), undefined, 'invalid' as any)
      expect(addErrorSpy.calls.argsFor(0)[0].source).toBe(ErrorSource.CUSTOM)
      expect(consoleSpy).toHaveBeenCalledWith("DD_RUM.addError: Invalid source 'invalid'")
    })

    describe('save context when capturing an error', () => {
      it('saves the date', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(ONE_SECOND)
        publicApi.addError(new Error('foo'))

        clock.tick(ONE_SECOND)
        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].startTime).toEqual(ONE_SECOND)
      })

      it('stores a deep copy of the global context', () => {
        publicApi.addRumGlobalContext('foo', 'bar')
        publicApi.addError(new Error('message'))
        publicApi.addRumGlobalContext('foo', 'baz')

        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[1]!.context).toEqual({
          foo: 'bar',
        })
      })

      it('stores a deep copy of the user', () => {
        const user = { id: 'foo' }
        publicApi.setUser(user)
        publicApi.addError(new Error('message'))
        user.id = 'bar'

        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[1]!.user).toEqual({
          id: 'foo',
        })
      })

      it('stores a deep copy of the error context', () => {
        const context = { foo: 'bar' }
        publicApi.addError(new Error('message'), context)
        context.foo = 'baz'

        publicApi.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].context).toEqual({
          foo: 'bar',
        })
      })
    })
  })

  describe('setUser', () => {
    let addActionSpy: jasmine.Spy<ReturnType<StartRum>['addAction']>
    let errorSpy: jasmine.Spy<() => void>
    let publicApi: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addActionSpy = jasmine.createSpy()
      errorSpy = spyOn(console, 'error')
      publicApi = makeRumPublicApi(() => ({
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
      publicApi.setUser(user)
      publicApi.addAction('message')

      publicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({
        email: 'qux',
        foo: { bar: 'qux' },
        id: 'foo',
        name: 'bar',
      })
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should sanitize predefined properties', () => {
      // tslint:disable-next-line:no-null-keyword
      const user = { id: null, name: 2, email: { bar: 'qux' } }
      publicApi.setUser(user as any)
      publicApi.addAction('message')

      publicApi.init(DEFAULT_INIT_CONFIGURATION)

      expect(addActionSpy.calls.argsFor(0)[1]!.user).toEqual({
        email: '[object Object]',
        id: 'null',
        name: '2',
      })
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should reject non object input', () => {
      publicApi.setUser(2 as any)
      // tslint:disable-next-line:no-null-keyword
      publicApi.setUser(null as any)
      publicApi.setUser(undefined as any)
      expect(errorSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('addTiming', () => {
    let addTimingSpy: jasmine.Spy<ReturnType<StartRum>['addTiming']>
    let errorSpy: jasmine.Spy<() => void>
    let rumGlobal: RumPublicApi
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addTimingSpy = jasmine.createSpy()
      errorSpy = spyOn(console, 'error')
      const configuration: Partial<Configuration> = {
        isEnabled: () => true,
      }
      rumGlobal = makeRumPublicApi(() => ({
        ...noopStartRum(),
        addTiming: addTimingSpy,
        configuration: configuration as Configuration,
      }))
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should add custom timings', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      // tslint:disable-next-line: no-unsafe-any
      ;(rumGlobal as any).addTiming('foo')
      expect(addTimingSpy.calls.argsFor(0)[0]).toEqual('foo')
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
