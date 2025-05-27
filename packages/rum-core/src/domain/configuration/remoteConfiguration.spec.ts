import { DefaultPrivacyLevel, display, INTAKE_SITE_US1 } from '@datadog/browser-core'
import { interceptRequests } from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import { applyRemoteConfiguration, buildEndpoint, fetchRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_INIT_CONFIGURATION: RumInitConfiguration = {
  clientToken: 'xxx',
  applicationId: 'xxx',
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
}

describe('remoteConfiguration', () => {
  let displayErrorSpy: jasmine.Spy<typeof display.error>
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
    displayErrorSpy = spyOn(display, 'error')
  })

  describe('fetchRemoteConfiguration', () => {
    const configuration = { remoteConfigurationId: 'xxx' } as RumInitConfiguration
    let remoteConfigurationCallback: jasmine.Spy

    beforeEach(() => {
      remoteConfigurationCallback = jasmine.createSpy()
    })

    it('should fetch the remote configuration', (done) => {
      interceptor.withMockXhr((xhr) => {
        xhr.complete(200, '{"rum":{"sessionSampleRate":50,"sessionReplaySampleRate":50,"defaultPrivacyLevel":"allow"}}')

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
    it('should override the initConfiguration options with the ones from the remote configuration', () => {
      const remoteConfiguration: Partial<RumInitConfiguration> = {
        sessionSampleRate: 1,
        sessionReplaySampleRate: 1,
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, remoteConfiguration)).toEqual(
        jasmine.objectContaining(remoteConfiguration)
      )
    })
  })

  describe('buildEndpoint', () => {
    it('should return the remote configuration endpoint', () => {
      const remoteConfigurationId = '0e008b1b-8600-4709-9d1d-f4edcfdf5587'
      expect(buildEndpoint({ site: INTAKE_SITE_US1, remoteConfigurationId } as RumInitConfiguration)).toEqual(
        `https://sdk-configuration.browser-intake-datadoghq.com/v1/${remoteConfigurationId}.json`
      )
    })
  })
})
