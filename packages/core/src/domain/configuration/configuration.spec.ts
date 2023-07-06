import type { RumEvent } from '../../../../rum-core/src'
import { display } from '../../tools/display'
import {
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  resetExperimentalFeatures,
} from '../../tools/experimentalFeatures'
import type { InitConfiguration } from './configuration'
import { validateAndBuildConfiguration } from './configuration'

describe('validateAndBuildConfiguration', () => {
  const clientToken = 'some_client_token'

  afterEach(() => {
    resetExperimentalFeatures()
  })

  describe('experimentalFeatures', () => {
    const TEST_FEATURE_FLAG = 'foo' as ExperimentalFeature

    beforeEach(() => {
      ;(ExperimentalFeature as any).FOO = TEST_FEATURE_FLAG
    })

    afterEach(() => {
      delete (ExperimentalFeature as any).FOO
    })

    it('updates experimental feature flags', () => {
      validateAndBuildConfiguration({ clientToken, enableExperimentalFeatures: ['foo'] })
      expect(isExperimentalFeatureEnabled(TEST_FEATURE_FLAG)).toBeTrue()
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
    let displaySpy: jasmine.Spy<typeof display.error>

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
    })

    it('requires the InitConfiguration to be defined', () => {
      expect(validateAndBuildConfiguration(undefined as unknown as InitConfiguration)).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Client Token is not configured, we will not send any data.')
    })

    it('requires clientToken to be defined', () => {
      expect(validateAndBuildConfiguration({} as unknown as InitConfiguration)).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Client Token is not configured, we will not send any data.')
    })

    it("shouldn't display any error if the configuration is correct", () => {
      validateAndBuildConfiguration({ clientToken: 'yes' })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('requires sessionSampleRate to be a percentage', () => {
      expect(
        validateAndBuildConfiguration({ clientToken, sessionSampleRate: 'foo' } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Session Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      expect(
        validateAndBuildConfiguration({ clientToken, sessionSampleRate: 200 } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Session Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      validateAndBuildConfiguration({ clientToken: 'yes', sessionSampleRate: 1 })
      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('requires telemetrySampleRate to be a percentage', () => {
      expect(
        validateAndBuildConfiguration({ clientToken, telemetrySampleRate: 'foo' } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Telemetry Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      expect(
        validateAndBuildConfiguration({ clientToken, telemetrySampleRate: 200 } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Telemetry Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      validateAndBuildConfiguration({ clientToken: 'yes', telemetrySampleRate: 1 })
      expect(displaySpy).not.toHaveBeenCalled()
    })
  })

  describe('sessionStoreStrategyType', () => {
    it('allowFallbackToLocalStorage should not be enabled by default', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const configuration = validateAndBuildConfiguration({ clientToken })
      expect(configuration?.sessionStoreStrategyType).toBeUndefined()
    })

    it('should contain cookie in the configuration by default', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, allowFallbackToLocalStorage: false })
      expect(configuration?.sessionStoreStrategyType).toEqual({
        type: 'Cookie',
        cookieOptions: { secure: false, crossSite: false },
      })
    })

    it('should contain cookie in the configuration when fallback is enabled and cookies are available', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, allowFallbackToLocalStorage: true })
      expect(configuration?.sessionStoreStrategyType).toEqual({
        type: 'Cookie',
        cookieOptions: { secure: false, crossSite: false },
      })
    })

    it('should contain local storage in the configuration when fallback is enabled and cookies are not available', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const configuration = validateAndBuildConfiguration({ clientToken, allowFallbackToLocalStorage: true })
      expect(configuration?.sessionStoreStrategyType).toEqual({ type: 'LocalStorage' })
    })

    it('should not contain any storage if both cookies and local storage are unavailable', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      spyOn(Storage.prototype, 'getItem').and.throwError('unavailable')
      const configuration = validateAndBuildConfiguration({ clientToken, allowFallbackToLocalStorage: true })
      expect(configuration?.sessionStoreStrategyType).toBeUndefined()
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

    it('should catch errors and log them', () => {
      const myError = 'Ooops!'
      const beforeSend = () => {
        throw myError
      }
      const configuration = validateAndBuildConfiguration({ clientToken, beforeSend })!
      const displaySpy = spyOn(display, 'error')
      expect(configuration.beforeSend!(null, {})).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledWith('beforeSend threw an error:', myError)
    })
  })
})
