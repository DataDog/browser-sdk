import { validateAndBuildConfiguration as _validateAndBuildConfiguration } from '@datadog/js-core/configuration'
import type { RumEvent } from '../../../../browser-rum-core/src'
import { EXHAUSTIVE_INIT_CONFIGURATION, SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION } from '../../../test'
import type { ExtractTelemetryConfiguration, MapInitConfigurationKey } from '../../../test'
import { display } from '../../tools/display'
import { ExperimentalFeature, isExperimentalFeatureEnabled } from '../../tools/experimentalFeatures'
import { TrackingConsent } from '../trackingConsent'
import type { InitConfiguration } from './configuration'
import { BROWSER_CORE_SCHEMA, serializeConfiguration } from './configuration'

describe('BROWSER_CORE_SCHEMA', () => {
  const validateAndBuildConfiguration = (initConfiguration: InitConfiguration) =>
    _validateAndBuildConfiguration(
      initConfiguration as unknown as Record<string, unknown>,
      BROWSER_CORE_SCHEMA,
      display
    )
  const clientToken = 'some_client_token'

  let displaySpy: jasmine.Spy<typeof display.error>

  beforeEach(() => {
    displaySpy = spyOn(display, 'error')
  })

  describe('experimentalFeatures', () => {
    const TEST_FEATURE_FLAG = 'foo' as ExperimentalFeature

    beforeEach(() => {
      ;(ExperimentalFeature as any).FOO = TEST_FEATURE_FLAG
    })

    afterEach(() => {
      delete (ExperimentalFeature as any).FOO
    })

    it('ignores unknown experimental features', () => {
      validateAndBuildConfiguration({
        clientToken,
        enableExperimentalFeatures: ['bar', undefined as any, null as any, 11 as any],
      })
      expect(isExperimentalFeatureEnabled('bar' as any)).toBeFalse()
      expect(isExperimentalFeatureEnabled(undefined as any)).toBeFalse()
      expect(isExperimentalFeatureEnabled(null as any)).toBeFalse()
      expect(isExperimentalFeatureEnabled(11 as any)).toBeFalse()
    })
  })

  describe('validate init configuration', () => {
    it('requires the InitConfiguration to be defined', () => {
      expect(validateAndBuildConfiguration(undefined as unknown as InitConfiguration)).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Configuration must be an object')
    })

    it('requires clientToken to be defined', () => {
      expect(validateAndBuildConfiguration({} as unknown as InitConfiguration)).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"clientToken" is required')
    })

    it("shouldn't display any error if the configuration is correct", () => {
      validateAndBuildConfiguration({ clientToken: 'yes' })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('displays an error and rejects the configuration on invalid sessionSampleRate', () => {
      expect(
        validateAndBuildConfiguration({ clientToken, sessionSampleRate: 'foo' } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"sessionSampleRate" must be a number between 0 and 100')

      displaySpy.calls.reset()
      expect(validateAndBuildConfiguration({ clientToken, sessionSampleRate: 200 })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"sessionSampleRate" must be a number between 0 and 100')

      displaySpy.calls.reset()
      validateAndBuildConfiguration({ clientToken: 'yes', sessionSampleRate: 1 })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('displays an error and rejects the configuration on invalid telemetrySampleRate', () => {
      expect(
        validateAndBuildConfiguration({ clientToken, telemetrySampleRate: 'foo' } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"telemetrySampleRate" must be a number between 0 and 100')

      displaySpy.calls.reset()
      expect(validateAndBuildConfiguration({ clientToken, telemetrySampleRate: 200 })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"telemetrySampleRate" must be a number between 0 and 100')

      displaySpy.calls.reset()
      validateAndBuildConfiguration({ clientToken: 'yes', telemetrySampleRate: 1 })
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = validateAndBuildConfiguration({ clientToken })!
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use site value when set', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, site: 'datadoghq.com' })!
      expect(configuration.site).toBe('datadoghq.com')
    })
  })

  describe('source', () => {
    it('should use the browser source by default', () => {
      const configuration = validateAndBuildConfiguration({ clientToken })!
      expect(configuration.source).toBe('browser')
    })

    it('should use the flutter and unity sources when set', () => {
      expect(validateAndBuildConfiguration({ clientToken, source: 'flutter' })!.source).toBe('flutter')
      expect(validateAndBuildConfiguration({ clientToken, source: 'unity' })!.source).toBe('unity')
    })

    it('should fall back to the browser source when set to an unsupported value', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, source: 'invalid' as any })!
      expect(configuration.source).toBe('browser')
    })
  })

  describe('beforeSend', () => {
    it('should be undefined when beforeSend is missing on user configuration', () => {
      const configuration = validateAndBuildConfiguration({ clientToken })!
      expect(configuration.beforeSend).toBeUndefined()
    })

    it('should return the same result as the original', () => {
      const beforeSend = (event: RumEvent) => {
        if (event.view.url === '/foo') {
          return false
        }
      }
      const configuration = validateAndBuildConfiguration({ clientToken, beforeSend })!
      expect(configuration.beforeSend!({ view: { url: '/foo' } }, {})).toBeFalse()
      expect(configuration.beforeSend!({ view: { url: '/bar' } }, {})).toBeUndefined()
    })
  })

  describe('trackingConsent', () => {
    it('defaults to "granted"', () => {
      expect(validateAndBuildConfiguration({ clientToken: 'yes' })!.trackingConsent).toBe(TrackingConsent.GRANTED)
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildConfiguration({ clientToken: 'yes', trackingConsent: TrackingConsent.NOT_GRANTED })!
          .trackingConsent
      ).toBe(TrackingConsent.NOT_GRANTED)
      expect(
        validateAndBuildConfiguration({ clientToken: 'yes', trackingConsent: TrackingConsent.GRANTED })!.trackingConsent
      ).toBe(TrackingConsent.GRANTED)
    })

    it('rejects invalid values', () => {
      expect(validateAndBuildConfiguration({ clientToken: 'yes', trackingConsent: 'foo' as any })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"trackingConsent" must be one of: "granted", "not-granted"')
    })
  })

  describe('cookie options', () => {
    it('defaults useSecureSessionCookie to false', () => {
      expect(validateAndBuildConfiguration({ clientToken })!.useSecureSessionCookie).toBe(false)
    })

    it('defaults usePartitionedCrossSiteSessionCookie to false', () => {
      expect(validateAndBuildConfiguration({ clientToken })!.usePartitionedCrossSiteSessionCookie).toBe(false)
    })

    it('defaults trackSessionAcrossSubdomains to false', () => {
      expect(validateAndBuildConfiguration({ clientToken })!.trackSessionAcrossSubdomains).toBe(false)
    })

    it('uses the provided values when set', () => {
      const configuration = validateAndBuildConfiguration({
        clientToken,
        useSecureSessionCookie: true,
        usePartitionedCrossSiteSessionCookie: true,
        trackSessionAcrossSubdomains: true,
      })!
      expect(configuration.useSecureSessionCookie).toBe(true)
      expect(configuration.usePartitionedCrossSiteSessionCookie).toBe(true)
      expect(configuration.trackSessionAcrossSubdomains).toBe(true)
    })
  })

  describe('site parameter validation', () => {
    it('should fail and display an error on an unrecognized site', () => {
      expect(validateAndBuildConfiguration({ clientToken, site: 'foo.com' })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith(
        '"site" must be a valid Datadog site. More details: https://docs.datadoghq.com/getting_started/site/.'
      )
    })
  })

  describe('env parameter validation', () => {
    it('should display an error and reject the configuration on invalid env', () => {
      expect(validateAndBuildConfiguration({ clientToken, env: false as any })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"env" must be a non-empty string')
    })
  })

  describe('service parameter validation', () => {
    it('should display an error and reject the configuration on invalid service', () => {
      expect(validateAndBuildConfiguration({ clientToken, service: 1 as any })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"service" must be a non-empty string')
    })

    it('should not reject null', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, service: null })
      expect(configuration!.service).toBeUndefined()
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('version parameter validation', () => {
    it('should display an error and reject the configuration on invalid version', () => {
      expect(validateAndBuildConfiguration({ clientToken, version: 0 as any })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"version" must be a non-empty string')
    })
  })

  describe('allowedTrackingOrigins parameter validation', () => {
    it('should normalize a single valid value to an array without error', () => {
      const config = validateAndBuildConfiguration({ clientToken, allowedTrackingOrigins: 'foo' as any })
      expect(config!.allowedTrackingOrigins).toEqual(['foo'])
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('should display an error and fail for a non-match-option value', () => {
      expect(validateAndBuildConfiguration({ clientToken, allowedTrackingOrigins: 42 as any })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('"allowedTrackingOrigins" must be a string, RegExp, or function')
    })
  })

  describe('serializeConfiguration', () => {
    it('should serialize the configuration', () => {
      // By specifying the type here, we can ensure that serializeConfiguration is returning an
      // object containing all expected properties.
      const serializedConfiguration: ExtractTelemetryConfiguration<MapInitConfigurationKey<keyof InitConfiguration>> =
        serializeConfiguration(EXHAUSTIVE_INIT_CONFIGURATION)

      expect(serializedConfiguration).toEqual(SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION)
    })
  })
})
