import type { Payload } from '../../transport'
import { INTAKE_SITE_FED_STAGING } from '../intakeSites'
import { computeTransportConfiguration } from './transportConfiguration'

const DEFAULT_PAYLOAD = {} as Payload

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const internalAnalyticsSubdomain = 'ia-rum-intake'

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use logs intake domain for fed staging', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: INTAKE_SITE_FED_STAGING })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(
        'http-intake.logs.dd0g-gov.com'
      )
      expect(configuration.site).toBe(INTAKE_SITE_FED_STAGING)
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.com' })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })
  })

  describe('internalAnalyticsSubdomain', () => {
    it('should use internal analytics subdomain value when set for datadoghq.com site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(internalAnalyticsSubdomain)
    })

    it('should not use internal analytics subdomain value when set for other sites', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        site: 'us3.datadoghq.com',
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).not.toContain(internalAnalyticsSubdomain)
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
    expect(configuration.replicaEndpointBuilders!.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(
      `application.id=${replicaApplicationId}`
    )
  })
})
