import { display } from '@datadog/browser-core'

import {
  validateAndBuildExposureConfiguration,
  serializeExposureConfiguration,
  type ExposureInitConfiguration,
} from './configuration'

describe('exposure configuration', () => {
  const DEFAULT_INIT_CONFIGURATION: ExposureInitConfiguration = {
    clientToken: 'xxx',
    service: 'test-service',
    telemetrySampleRate: 0,
  }

  describe('validateAndBuildExposureConfiguration', () => {
    it('should validate and build configuration with required fields', () => {
      const configuration = validateAndBuildExposureConfiguration(DEFAULT_INIT_CONFIGURATION)

      expect(configuration).toBeDefined()
      expect(configuration!.service).toBe('test-service')
      expect(configuration!.beforeSend).toBeUndefined()
      expect(configuration!.eventRateLimiterThreshold).toBe(100)
      expect(configuration!.maxBatchSize).toBe(50)
    })

    it('should use default service when not provided', () => {
      const initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: undefined }
      const configuration = validateAndBuildExposureConfiguration(initConfiguration)

      expect(configuration!.service).toBe('browser')
    })

    it('should handle custom service name', () => {
      const initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, service: 'custom-service' }
      const configuration = validateAndBuildExposureConfiguration(initConfiguration)

      expect(configuration!.service).toBe('custom-service')
    })

    it('should handle version and env', () => {
      const initConfiguration = {
        ...DEFAULT_INIT_CONFIGURATION,
        version: '1.0.0',
        env: 'production',
      }
      const configuration = validateAndBuildExposureConfiguration(initConfiguration)

      expect(configuration!.version).toBe('1.0.0')
      expect(configuration!.env).toBe('production')
    })

    it('should handle beforeSend callback', () => {
      const beforeSend = jasmine.createSpy('beforeSend').and.returnValue(true)
      const initConfiguration = { ...DEFAULT_INIT_CONFIGURATION, beforeSend }
      const configuration = validateAndBuildExposureConfiguration(initConfiguration)

      expect(configuration!.beforeSend).toBe(beforeSend)
    })

    it('should return undefined for invalid configuration', () => {
      const invalidConfiguration = { clientToken: '' } as ExposureInitConfiguration
      const configuration = validateAndBuildExposureConfiguration(invalidConfiguration)

      expect(configuration).toBeUndefined()
    })
  })

  describe('serializeExposureConfiguration', () => {
    it('should serialize configuration with all fields', () => {
      const initConfiguration: ExposureInitConfiguration = {
        ...DEFAULT_INIT_CONFIGURATION,
        service: 'custom-service',
        version: '1.0.0',
        env: 'production',
      }

      const serialized = serializeExposureConfiguration(initConfiguration)

      expect(serialized).toEqual(
        jasmine.objectContaining({
          service: 'custom-service',
          version: '1.0.0',
          env: 'production',
          client_token: 'xxx',
        })
      )
    })

    it('should handle undefined optional fields', () => {
      const initConfiguration: ExposureInitConfiguration = {
        ...DEFAULT_INIT_CONFIGURATION,
        version: undefined,
        env: undefined,
      }

      const serialized = serializeExposureConfiguration(initConfiguration)

      expect(serialized).toEqual(
        jasmine.objectContaining({
          service: 'test-service',
          client_token: 'xxx',
        })
      )
      expect(serialized.version).toBeUndefined()
      expect(serialized.env).toBeUndefined()
    })
  })
}) 