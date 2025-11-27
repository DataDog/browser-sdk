import type { Payload } from '../../transport'
import { computeTransportConfiguration } from './transportConfiguration'

const DEFAULT_PAYLOAD = {} as Payload

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.com' })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })
  })

  it('adds the replica application id to the rum replica endpoint', () => {
    const replicaApplicationId = 'replica-application-id'
    const configuration = computeTransportConfiguration({
      clientToken,
      replica: {
        clientToken: 'replica-client-token',
        applicationId: replicaApplicationId,
      },
    })
    expect(configuration.replica!.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(
      `application.id=${replicaApplicationId}`
    )
  })
})
