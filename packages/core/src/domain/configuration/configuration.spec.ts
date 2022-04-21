import type { RumEvent } from '../../../../rum-core/src'
import { display } from '../../tools/display'
import type { InitConfiguration } from './configuration'
import { validateAndBuildConfiguration } from './configuration'
import { isExperimentalFeatureEnabled, updateExperimentalFeatures } from './experimentalFeatures'

describe('validateAndBuildConfiguration', () => {
  const clientToken = 'some_client_token'

  beforeEach(() => {
    updateExperimentalFeatures([])
  })

  it('updates experimental feature flags', () => {
    validateAndBuildConfiguration({ clientToken, enableExperimentalFeatures: ['foo'] })
    expect(isExperimentalFeatureEnabled('foo')).toBeTrue()
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

    it('requires sampleRate to be a percentage', () => {
      expect(
        validateAndBuildConfiguration({ clientToken, sampleRate: 'foo' } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      expect(
        validateAndBuildConfiguration({ clientToken, sampleRate: 200 } as unknown as InitConfiguration)
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      validateAndBuildConfiguration({ clientToken: 'yes', sampleRate: 1 })
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

  describe('cookie options', () => {
    it('should not be secure nor crossSite by default', () => {
      const configuration = validateAndBuildConfiguration({ clientToken })!
      expect(configuration.cookieOptions).toEqual({ secure: false, crossSite: false })
    })

    it('should be secure when `useSecureSessionCookie` is truthy', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, useSecureSessionCookie: true })!
      expect(configuration.cookieOptions).toEqual({ secure: true, crossSite: false })
    })

    it('should be secure and crossSite when `useCrossSiteSessionCookie` is truthy', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, useCrossSiteSessionCookie: true })!
      expect(configuration.cookieOptions).toEqual({ secure: true, crossSite: true })
    })

    it('should have domain when `trackSessionAcrossSubdomains` is truthy', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, trackSessionAcrossSubdomains: true })!
      expect(configuration.cookieOptions).toEqual({ secure: false, crossSite: false, domain: jasmine.any(String) })
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
