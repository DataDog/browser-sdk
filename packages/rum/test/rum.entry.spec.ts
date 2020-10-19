import { ONE_SECOND } from '@datadog/browser-core'
import { makeRumGlobal, RumGlobal, RumUserConfiguration, StartRum } from '../src/rum.entry'
import { ActionType } from '../src/userActionCollection'
import { setup, TestSetupBuilder } from './specHelper'

const noopStartRum = () => ({
  addError: () => undefined,
  addUserAction: () => undefined,
  getInternalContext: () => undefined,
})
const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('rum entry', () => {
  describe('configuration validation', () => {
    let rumGlobal: RumGlobal
    let errorSpy: jasmine.Spy

    beforeEach(() => {
      errorSpy = spyOn(console, 'error')
      rumGlobal = makeRumGlobal(noopStartRum)
    })

    it('init should log an error with no application id', () => {
      const invalidConfiguration = { clientToken: 'yes' }
      rumGlobal.init(invalidConfiguration as RumUserConfiguration)
      expect(console.error).toHaveBeenCalledTimes(1)

      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes' })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('init should log an error if sampleRate is invalid', () => {
      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('init should log an error if resourceSampleRate is invalid', () => {
      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 'foo' as any })
      expect(errorSpy).toHaveBeenCalledTimes(1)

      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', resourceSampleRate: 200 })
      expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('should log an error if init is called several times', () => {
      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should log an error if tracing is enabled without a service configured', () => {
      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', allowedTracingOrigins: [] })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      makeRumGlobal(noopStartRum).init({
        allowedTracingOrigins: ['foo.bar'],
        applicationId: 'yes',
        clientToken: 'yes',
        service: 'foo',
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      makeRumGlobal(noopStartRum).init({
        allowedTracingOrigins: ['foo.bar'],
        applicationId: 'yes',
        clientToken: 'yes',
      })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should not log an error if init is called several times and silentMultipleInit is true', () => {
      rumGlobal.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)

      rumGlobal.init({
        applicationId: 'yes',
        clientToken: 'yes',
        resourceSampleRate: 1,
        sampleRate: 1,
        silentMultipleInit: true,
      })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })

    it("shouldn't trigger any console.log if the configuration is correct", () => {
      rumGlobal.init({ clientToken: 'yes', applicationId: 'yes', sampleRate: 1, resourceSampleRate: 1 })
      expect(errorSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('getInternalContext', () => {
    let getInternalContextSpy: jasmine.Spy<ReturnType<StartRum>['getInternalContext']>
    let rumGlobal: RumGlobal

    beforeEach(() => {
      getInternalContextSpy = jasmine.createSpy().and.callFake(() => ({
        application_id: '123',
        session_id: '123',
      }))
      rumGlobal = makeRumGlobal(() => ({
        ...noopStartRum(),
        getInternalContext: getInternalContextSpy,
      }))
    })

    it('returns undefined before init', () => {
      expect(rumGlobal.getInternalContext()).toBe(undefined)
      expect(getInternalContextSpy).not.toHaveBeenCalled()
    })

    it('returns the internal context after init', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

      expect(rumGlobal.getInternalContext()).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalled()
    })

    it('uses the startTime if specified', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

      const startTime = 234832890
      expect(rumGlobal.getInternalContext(startTime)).toEqual({ application_id: '123', session_id: '123' })
      expect(getInternalContextSpy).toHaveBeenCalledWith(startTime)
    })
  })

  describe('addUserAction', () => {
    let addUserActionSpy: jasmine.Spy<ReturnType<StartRum>['addUserAction']>
    let rumGlobal: RumGlobal
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addUserActionSpy = jasmine.createSpy()
      rumGlobal = makeRumGlobal(() => ({
        ...noopStartRum(),
        addUserAction: addUserActionSpy,
      }))
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('allows sending user actions before init', () => {
      rumGlobal.addUserAction('foo', { bar: 'baz' })

      expect(addUserActionSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

      expect(addUserActionSpy).toHaveBeenCalledTimes(1)
      expect(addUserActionSpy.calls.argsFor(0)).toEqual([
        {
          context: { bar: 'baz' },
          name: 'foo',
          startTime: jasmine.any(Number),
          type: ActionType.CUSTOM,
        },
        {},
      ])
    })

    describe('save context when sending a user action', () => {
      it('saves the date', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(ONE_SECOND)
        rumGlobal.addUserAction('foo')

        clock.tick(ONE_SECOND)
        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

        expect(addUserActionSpy.calls.argsFor(0)[0].startTime).toEqual(ONE_SECOND)
      })

      it('stores a deep copy of the global context', () => {
        rumGlobal.addRumGlobalContext('foo', 'bar')
        rumGlobal.addUserAction('message')
        rumGlobal.addRumGlobalContext('foo', 'baz')

        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

        expect(addUserActionSpy.calls.argsFor(0)[1]).toEqual({
          foo: 'bar',
        })
      })

      it('stores a deep copy of the action context', () => {
        const context = { foo: 'bar' }
        rumGlobal.addUserAction('message', context)
        context.foo = 'baz'

        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

        expect(addUserActionSpy.calls.argsFor(0)[0].context).toEqual({
          foo: 'bar',
        })
      })
    })
  })

  describe('addError', () => {
    let addErrorSpy: jasmine.Spy<ReturnType<StartRum>['addError']>
    let rumGlobal: RumGlobal
    let setupBuilder: TestSetupBuilder

    beforeEach(() => {
      addErrorSpy = jasmine.createSpy()
      rumGlobal = makeRumGlobal(() => ({
        ...noopStartRum(),
        addError: addErrorSpy,
      }))
      setupBuilder = setup()
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('allows capturing an error before init', () => {
      rumGlobal.addError(new Error('foo'))

      expect(addErrorSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

      expect(addErrorSpy).toHaveBeenCalledTimes(1)
      expect(addErrorSpy.calls.argsFor(0)).toEqual([
        {
          context: undefined,
          error: new Error('foo'),
          startTime: jasmine.any(Number),
        },
        {},
      ])
    })

    describe('save context when capturing an error', () => {
      it('saves the date', () => {
        const { clock } = setupBuilder.withFakeClock().build()

        clock.tick(ONE_SECOND)
        rumGlobal.addError(new Error('foo'))

        clock.tick(ONE_SECOND)
        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].startTime).toEqual(ONE_SECOND)
      })

      it('stores a deep copy of the global context', () => {
        rumGlobal.addRumGlobalContext('foo', 'bar')
        rumGlobal.addError(new Error('message'))
        rumGlobal.addRumGlobalContext('foo', 'baz')

        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[1]).toEqual({
          foo: 'bar',
        })
      })

      it('stores a deep copy of the error context', () => {
        const context = { foo: 'bar' }
        rumGlobal.addError(new Error('message'), context)
        context.foo = 'baz'

        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)

        expect(addErrorSpy.calls.argsFor(0)[0].context).toEqual({
          foo: 'bar',
        })
      })
    })
  })
})
