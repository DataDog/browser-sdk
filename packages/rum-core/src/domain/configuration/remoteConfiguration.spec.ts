import { DefaultPrivacyLevel, INTAKE_SITE_US1 } from '@datadog/browser-core'
import { interceptRequests } from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import type { RemoteConfiguration } from './remoteConfiguration'
import { applyRemoteConfiguration, buildEndpoint, fetchRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_INIT_CONFIGURATION: RumInitConfiguration = {
  clientToken: 'xxx',
  applicationId: 'xxx',
  service: 'xxx',
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
}

describe('remoteConfiguration', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  describe('fetchRemoteConfiguration', () => {
    const configuration = { remoteConfigurationId: 'xxx' } as RumInitConfiguration

    it('should fetch the remote configuration', (done) => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              rum: {
                applicationId: 'xxx',
                sessionSampleRate: 50,
                sessionReplaySampleRate: 50,
                defaultPrivacyLevel: 'allow',
              },
            }),
        })
      )

      fetchRemoteConfiguration(configuration)
        .then((remoteConfiguration) => {
          expect(remoteConfiguration).toEqual({
            applicationId: 'xxx',
            sessionSampleRate: 50,
            sessionReplaySampleRate: 50,
            defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
          })
          done()
        })
        .catch(done.fail)
    })

    it('should throw an error if the fetching fails with a server error', (done) => {
      interceptor.withFetch(() => Promise.reject(new Error('Server error')))

      fetchRemoteConfiguration(configuration)
        .then(() => done.fail())
        .catch((error) => {
          expect(error.message).toEqual('Error fetching the remote configuration.')
          done()
        })
    })

    it('should throw an error if the fetching fails with a client error', (done) => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: false,
        })
      )

      fetchRemoteConfiguration(configuration)
        .then(() => done.fail())
        .catch((error) => {
          expect(error.message).toEqual('Error fetching the remote configuration.')
          done()
        })
    })

    it('should throw an error if the remote config does not contain rum config', (done) => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      )

      fetchRemoteConfiguration(configuration)
        .then(() => done.fail())
        .catch((error) => {
          expect(error.message).toEqual('No remote configuration for RUM.')
          done()
        })
    })
  })

  describe('applyRemoteConfiguration', () => {
    it('should override the initConfiguration options with the ones from the remote configuration', () => {
      const rumRemoteConfiguration: RemoteConfiguration['rum'] = {
        applicationId: 'yyy',
        sessionSampleRate: 1,
        sessionReplaySampleRate: 1,
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration)).toEqual({
        applicationId: 'yyy',
        clientToken: 'xxx',
        service: 'xxx',
        sessionSampleRate: 1,
        sessionReplaySampleRate: 1,
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      })
    })
  })

  describe('buildEndpoint', () => {
    it('should return the remote configuration endpoint', () => {
      const remoteConfigurationId = '0e008b1b-8600-4709-9d1d-f4edcfdf5587'
      expect(buildEndpoint({ site: INTAKE_SITE_US1, remoteConfigurationId } as RumInitConfiguration)).toEqual(
        `https://sdk-configuration.browser-intake-datadoghq.com/v1/${remoteConfigurationId}.json`
      )
    })

    it('should return the remote configuration proxy', () => {
      expect(buildEndpoint({ remoteConfigurationProxy: '/config' } as RumInitConfiguration)).toEqual('/config')
    })
  })
})
