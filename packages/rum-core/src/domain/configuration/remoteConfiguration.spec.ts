import { DefaultPrivacyLevel, display } from '@datadog/browser-core'
import { interceptRequests } from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import { applyRemoteConfiguration, fetchRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_INIT_CONFIGURATION = {
  clientToken: 'xxx',
  applicationId: 'xxx',
  samplingRate: 100,
  sessionReplaySamplingRate: 100,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
} as RumInitConfiguration

describe('remoteConfiguration', () => {
  let displayErrorSpy: jasmine.Spy<typeof display.error>
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
    displayErrorSpy = spyOn(display, 'error')
  })

  afterEach(() => {
    interceptor.restore()
  })
  describe('fetchRemoteConfiguration', () => {
    const configuration = { remoteConfigurationId: 'xxx' } as RumInitConfiguration
    let remoteConfigurationCallback: jasmine.Spy

    beforeEach(() => {
      remoteConfigurationCallback = jasmine.createSpy()
    })

    it('should fetch the remote configuration', (done) => {
      interceptor.withMockXhr((xhr) => {
        xhr.complete(200, '{"sessionSampleRate":50,"sessionReplaySampleRate":50,"defaultPrivacyLevel":"allow"}')

        expect(remoteConfigurationCallback).toHaveBeenCalledWith({
          sessionSampleRate: 50,
          sessionReplaySampleRate: 50,
          defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
        })

        done()
      })
      fetchRemoteConfiguration(configuration, remoteConfigurationCallback)
    })

    it('should print an error if the fetching as failed', (done) => {
      interceptor.withMockXhr((xhr) => {
        xhr.complete(500)
        expect(remoteConfigurationCallback).not.toHaveBeenCalled()
        expect(displayErrorSpy).toHaveBeenCalledOnceWith('Error fetching the remote configuration.')
        done()
      })
      fetchRemoteConfiguration(configuration, remoteConfigurationCallback)
    })
  })

  describe('applyRemoteConfiguration', () => {
    it('should override the iniConfiguration options with the ones from the remote configuration', () => {
      const remoteConfiguration = {
        samplingRate: 1,
        sessionReplaySamplingRate: 1,
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, remoteConfiguration)).toEqual(
        jasmine.objectContaining(remoteConfiguration)
      )
    })
  })
})
