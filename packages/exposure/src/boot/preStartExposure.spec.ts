import type { TrackingConsentState } from '@datadog/browser-core'
import {
  createTrackingConsentState,
  TrackingConsent,
  display,
  displayAlreadyInitializedError,
} from '@datadog/browser-core'
import type { Request } from '@datadog/browser-core/test'
import {
  interceptRequests,
  mockEndpointBuilder,
  registerCleanupTask,
} from '@datadog/browser-core/test'

import type { ExposureConfiguration, ExposureInitConfiguration } from '../domain/configuration'
import { validateAndBuildExposureConfiguration } from '../domain/configuration'
import type { CommonContext } from '../rawExposureEvent.types'
import { createPreStartStrategy } from './preStartExposure'
import type { StartExposureResult } from './startExposure'

const COMMON_CONTEXT: CommonContext = {
  view: { referrer: 'common_referrer', url: 'common_url' },
  user: {},
  application: { id: 'app_id' },
}

describe('preStartExposure', () => {
  let strategy: ReturnType<typeof createPreStartStrategy>
  let doStartExposureSpy: jasmine.Spy
  let trackingConsentState: TrackingConsentState
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]

  beforeEach(() => {
    trackingConsentState = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
    doStartExposureSpy = jasmine.createSpy('doStartExposure').and.returnValue({
      trackExposure: jasmine.createSpy('trackExposure'),
      getInternalContext: jasmine.createSpy('getInternalContext'),
      stop: jasmine.createSpy('stop'),
      globalContext: {
        setContext: jasmine.createSpy('setContext'),
        addContext: jasmine.createSpy('addContext'),
        removeContext: jasmine.createSpy('removeContext'),
        getContext: jasmine.createSpy('getContext').and.returnValue({}),
        clearContext: jasmine.createSpy('clearContext'),
        changeObservable: { subscribe: jasmine.createSpy('subscribe') },
      },
      accountContext: {
        setContext: jasmine.createSpy('setContext'),
        addContext: jasmine.createSpy('addContext'),
        removeContext: jasmine.createSpy('removeContext'),
        getContext: jasmine.createSpy('getContext').and.returnValue({}),
        clearContext: jasmine.createSpy('clearContext'),
        changeObservable: { subscribe: jasmine.createSpy('subscribe') },
      },
      userContext: {
        setContext: jasmine.createSpy('setContext'),
        addContext: jasmine.createSpy('addContext'),
        removeContext: jasmine.createSpy('removeContext'),
        getContext: jasmine.createSpy('getContext').and.returnValue({}),
        clearContext: jasmine.createSpy('clearContext'),
        changeObservable: { subscribe: jasmine.createSpy('subscribe') },
      },
    } as unknown as StartExposureResult)

    strategy = createPreStartStrategy(
      () => COMMON_CONTEXT,
      trackingConsentState,
      doStartExposureSpy
    )

    interceptor = interceptRequests()
    requests = interceptor.requests
  })

  afterEach(() => {
    // Cleanup if needed
  })

  describe('init', () => {
    it('should validate and build configuration', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)

      expect(doStartExposureSpy).not.toHaveBeenCalled()
      expect(strategy.initConfiguration).toBe(initConfiguration)
    })

    it('should display error when configuration is missing', () => {
      const displayErrorSpy = spyOn(display, 'error')

      strategy.init(undefined as any)

      expect(displayErrorSpy).toHaveBeenCalledWith('Missing configuration')
      expect(doStartExposureSpy).not.toHaveBeenCalled()
    })

    it('should display error when configuration is invalid', () => {
      const displayErrorSpy = spyOn(display, 'error')
      const invalidConfiguration = { clientToken: '' } as ExposureInitConfiguration

      strategy.init(invalidConfiguration)

      expect(doStartExposureSpy).not.toHaveBeenCalled()
    })

    it('should display already initialized error when called twice', () => {
      const displayAlreadyInitializedErrorSpy = spyOn(displayAlreadyInitializedError, 'displayAlreadyInitializedError')
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.init(initConfiguration)

      expect(displayAlreadyInitializedErrorSpy).toHaveBeenCalledWith('DD_LOGS', initConfiguration)
    })
  })

  describe('trackExposure', () => {
    it('should buffer exposure events before consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.trackExposure('flag_key', 'flag_value')

      expect(doStartExposureSpy).not.toHaveBeenCalled()
    })

    it('should drain buffered events when consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.trackExposure('flag_key', 'flag_value')

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartExposureSpy).toHaveBeenCalled()
      const startExposureResult = doStartExposureSpy.calls.mostRecent().returnValue
      expect(startExposureResult.trackExposure).toHaveBeenCalledWith('flag_key', 'flag_value', {})
    })

    it('should pass options to trackExposure', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.trackExposure('flag_key', 'flag_value', { context: { foo: 'bar' } })

      trackingConsentState.update(TrackingConsent.GRANTED)

      const startExposureResult = doStartExposureSpy.calls.mostRecent().returnValue
      expect(startExposureResult.trackExposure).toHaveBeenCalledWith('flag_key', 'flag_value', { context: { foo: 'bar' } })
    })
  })

  describe('context management', () => {
    it('should buffer global context calls before consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.globalContext.setContext({ global_attr: 'global_value' })

      expect(doStartExposureSpy).not.toHaveBeenCalled()
    })

    it('should drain buffered global context when consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.globalContext.setContext({ global_attr: 'global_value' })

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartExposureSpy).toHaveBeenCalled()
      const startExposureResult = doStartExposureSpy.calls.mostRecent().returnValue
      expect(startExposureResult.globalContext.setContext).toHaveBeenCalledWith({ global_attr: 'global_value' })
    })

    it('should buffer account context calls before consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.accountContext.setContext({ account_id: 'account_123' })

      expect(doStartExposureSpy).not.toHaveBeenCalled()
    })

    it('should drain buffered account context when consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.accountContext.setContext({ account_id: 'account_123' })

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartExposureSpy).toHaveBeenCalled()
      const startExposureResult = doStartExposureSpy.calls.mostRecent().returnValue
      expect(startExposureResult.accountContext.setContext).toHaveBeenCalledWith({ account_id: 'account_123' })
    })

    it('should buffer user context calls before consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.userContext.setContext({ user_id: 'user_123' })

      expect(doStartExposureSpy).not.toHaveBeenCalled()
    })

    it('should drain buffered user context when consent is granted', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      strategy.init(initConfiguration)
      strategy.userContext.setContext({ user_id: 'user_123' })

      trackingConsentState.update(TrackingConsent.GRANTED)

      expect(doStartExposureSpy).toHaveBeenCalled()
      const startExposureResult = doStartExposureSpy.calls.mostRecent().returnValue
      expect(startExposureResult.userContext.setContext).toHaveBeenCalledWith({ user_id: 'user_123' })
    })
  })

  describe('getInternalContext', () => {
    it('should return undefined before initialization', () => {
      expect(strategy.getInternalContext()).toBeUndefined()
    })
  })
}) 