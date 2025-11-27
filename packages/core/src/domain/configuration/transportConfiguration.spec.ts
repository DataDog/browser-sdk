import type { Payload } from '../../transport'
import { computeTransportConfiguration } from './transportConfiguration'

const DEFAULT_PAYLOAD = {} as Payload

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'

  it('adds the replica application id to the rum replica endpoint', () => {
    const replicaApplicationId = 'replica-application-id'
    const configuration = computeTransportConfiguration({
      clientToken,
      replica: {
        clientToken: 'replica-client-token',
        applicationId: replicaApplicationId,
      },
    })
    expect(configuration.replicaEndpointBuilders!.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(
      `application.id=${replicaApplicationId}`
    )
  })
})
