import { DefaultPrivacyLevel, display } from '@datadog/browser-core'
import { interceptRequests } from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import type { RemoteConfigurationEvent } from './remoteConfiguration'
import { applyRemoteConfiguration, fetchRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_INIT_CONFIGURATION = {
  application_id: 'xxx',
  clientToken: 'xxx',
  applicationId: 'xxx',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
} as RumInitConfiguration

const FAKE_REMOTE_CONFIGURATION_EVENT: RemoteConfigurationEvent = {
  rum: {
    application_id: 'remote_application_id',
    service: 'remote_service',
    version: 'remote_version',
    session_sample_rate: 50,
    session_replay_sample_rate: 50,
    default_privacy_level: DefaultPrivacyLevel.ALLOW,
    enable_privacy_for_action_name: true,
  },
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
        xhr.complete(200, JSON.stringify(FAKE_REMOTE_CONFIGURATION_EVENT))

        expect(remoteConfigurationCallback).toHaveBeenCalledWith({
          applicationId: 'remote_application_id',
          service: 'remote_service',
          version: 'remote_version',
          sessionSampleRate: 50,
          sessionReplaySampleRate: 50,
          defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
          enablePrivacyForActionName: true,
        })

        done()
      })
      fetchRemoteConfiguration(configuration, remoteConfigurationCallback)
    })

    it('should fetch the remote configuration with unknown options', (done) => {
      interceptor.withMockXhr((xhr) => {
        xhr.complete(
          200,
          JSON.stringify({
            rum: {
              unknown: 'unknown',
            },
          })
        )

        expect(remoteConfigurationCallback).toHaveBeenCalledWith({
          unknown: 'unknown',
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
    it('should override the iniConfiguration options with remote configuration options', () => {
      const remoteConfiguration = {
        applicationId: 'remote_application_id',
        service: 'remote_service',
        version: 'remote_version',
        sessionSampleRate: 50,
        sessionReplaySampleRate: 50,
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
        enablePrivacyForActionName: true,
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, remoteConfiguration)).toEqual(
        jasmine.objectContaining(remoteConfiguration)
      )
    })

    it('should merge the iniConfiguration options with unknown remote configuration options', () => {
      const remoteConfiguration = {
        unknown: 'unknown',
      } as Partial<RumInitConfiguration>
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, remoteConfiguration)).toEqual(
        jasmine.objectContaining(remoteConfiguration)
      )
    })
  })
})
