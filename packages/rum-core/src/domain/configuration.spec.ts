import { DefaultPrivacyLevel, display } from '@datadog/browser-core'
import { validateAndBuildRumConfiguration } from './configuration'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx', applicationId: 'xxx' }

describe('validateAndBuildRumConfiguration', () => {
  let displaySpy: jasmine.Spy<typeof display.error>

  beforeEach(() => {
    displaySpy = spyOn(display, 'error')
  })

  describe('applicationId', () => {
    it('does not validate the configuration if it is missing', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, applicationId: undefined as any })
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Application ID is not configured, no RUM data will be collected.')
    })
  })

  describe('replaySampleRate', () => {
    it('defaults to 100 if the option is not provided', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.replaySampleRate).toBe(100)
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, replaySampleRate: 50 })!.replaySampleRate
      ).toBe(50)
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, replaySampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Replay Sample Rate should be a number between 0 and 100')

      displaySpy.calls.reset()
      expect(validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, replaySampleRate: 200 })).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Replay Sample Rate should be a number between 0 and 100')
    })
  })

  describe('allowedTracingOrigins', () => {
    it('defaults to an empty array', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.allowedTracingOrigins).toEqual([])
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingOrigins: ['foo'],
          service: 'bar',
        })!.allowedTracingOrigins
      ).toEqual(['foo'])
    })

    it('does not validate the configuration if a value is provided and service is undefined', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingOrigins: ['foo'] })
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Service need to be configured when tracing is enabled')
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingOrigins: 'foo' as any })
      ).toBeUndefined()
      expect(displaySpy).toHaveBeenCalledOnceWith('Allowed Tracing Origins should be an array')
    })
  })

  describe('trackInteractions', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackInteractions).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackInteractions: true })!.trackInteractions
      ).toBeTrue()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackInteractions: 'foo' as any })!
          .trackInteractions
      ).toBeTrue()
    })
  })

  describe('trackViewsManually', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackViewsManually).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: true })!
          .trackViewsManually
      ).toBeTrue()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: 'foo' as any })!
          .trackViewsManually
      ).toBeTrue()
    })
  })

  describe('actionNameAttribute', () => {
    it('defaults to undefined', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.actionNameAttribute).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, actionNameAttribute: 'foo' })!
          .actionNameAttribute
      ).toBe('foo')
    })
  })

  describe('defaultPrivacyLevel', () => {
    it('defaults to MASK_USER_INPUT', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.defaultPrivacyLevel).toBe(
        DefaultPrivacyLevel.MASK_USER_INPUT
      )
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
        })!.defaultPrivacyLevel
      ).toBe(DefaultPrivacyLevel.MASK)
    })

    it('ignores incorrect values', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, defaultPrivacyLevel: 'foo' as any })!
          .defaultPrivacyLevel
      ).toBe(DefaultPrivacyLevel.MASK_USER_INPUT)
    })
  })
})
