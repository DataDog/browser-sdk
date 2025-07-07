import type { TrackingConsentState } from '@datadog/browser-core'
import {
  createTrackingConsentState,
  TrackingConsent,
} from '@datadog/browser-core'

import type { ExposureInitConfiguration } from '../domain/configuration'
import { makeExposurePublicApi } from './exposurePublicApi'

describe('exposurePublicApi', () => {
  let publicApi: ReturnType<typeof makeExposurePublicApi>
  let trackingConsentState: TrackingConsentState

  beforeEach(() => {
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
    publicApi = makeExposurePublicApi(trackingConsentState)
  })

  describe('init', () => {
    it('should initialize with valid configuration', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      expect(() => publicApi.init(initConfiguration)).not.toThrow()
    })

    it('should handle missing configuration', () => {
      expect(() => publicApi.init(undefined as any)).not.toThrow()
    })
  })

  describe('trackExposure', () => {
    it('should track exposure events', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      publicApi.init(initConfiguration)
      expect(() => publicApi.trackExposure('flag_key', 'flag_value')).not.toThrow()
    })

    it('should track exposure events with options', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      publicApi.init(initConfiguration)
      expect(() => publicApi.trackExposure('flag_key', 'flag_value', { context: { foo: 'bar' } })).not.toThrow()
    })
  })

  describe('context management', () => {
    it('should set global context', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      publicApi.init(initConfiguration)
      expect(() => publicApi.globalContext.setContext({ global_attr: 'global_value' })).not.toThrow()
    })

    it('should set account context', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      publicApi.init(initConfiguration)
      expect(() => publicApi.accountContext.setContext({ account_id: 'account_123' })).not.toThrow()
    })

    it('should set user context', () => {
      const initConfiguration: ExposureInitConfiguration = {
        clientToken: 'xxx',
        service: 'test-service',
        telemetrySampleRate: 0,
      }

      publicApi.init(initConfiguration)
      expect(() => publicApi.userContext.setContext({ user_id: 'user_123' })).not.toThrow()
    })
  })

  describe('getInternalContext', () => {
    it('should return undefined before initialization', () => {
      expect(publicApi.getInternalContext()).toBeUndefined()
    })
  })
}) 