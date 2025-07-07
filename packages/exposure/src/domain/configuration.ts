import type { Configuration, InitConfiguration, EndpointBuilder, RawTelemetryConfiguration } from '@datadog/browser-core'
import { validateAndBuildConfiguration, serializeConfiguration } from '@datadog/browser-core'
import type { ExposureEvent } from '../exposureEvent.types'
import type { ExposureEventDomainContext } from '../domainContext.types'

export interface ExposureInitConfiguration extends InitConfiguration {
  /**
   * Access to every exposure event collected by the Exposure SDK before they are sent to Datadog.
   * It allows:
   * - Enrich your exposure events with additional context attributes
   * - Modify your exposure events to modify their content, or redact sensitive sequences
   * - Discard selected exposure events
   */
  beforeSend?: ((event: ExposureEvent, context: ExposureEventDomainContext) => boolean) | undefined
  
  /**
   * The service name for your application
   */
  service?: string | undefined | null
  
  /**
   * The version of your application
   */
  version?: string | undefined | null
  
  /**
   * The environment of your application
   */
  env?: string | undefined | null
}

export interface ExposureConfiguration extends Configuration {
  beforeSend: ExposureInitConfiguration['beforeSend']
  service: string
  version?: string
  env?: string
  eventRateLimiterThreshold: number
  maxBatchSize: number
  exposureEndpointBuilder: EndpointBuilder
}

export function validateAndBuildExposureConfiguration(
  initConfiguration: ExposureInitConfiguration
): ExposureConfiguration | undefined {
  const baseConfiguration = validateAndBuildConfiguration(initConfiguration)
  if (!baseConfiguration) {
    return undefined
  }

  return {
    ...baseConfiguration,
    service: initConfiguration.service || 'browser',
    version: initConfiguration.version || undefined,
    env: initConfiguration.env || undefined,
    beforeSend: initConfiguration.beforeSend,
    eventRateLimiterThreshold: 100,
    maxBatchSize: 50,
  }
}

export function serializeExposureConfiguration(configuration: ExposureInitConfiguration) {
  const baseSerializedInitConfiguration = serializeConfiguration(configuration)

  return {
    service: configuration.service,
    version: configuration.version,
    env: configuration.env,
    ...baseSerializedInitConfiguration,
  } satisfies RawTelemetryConfiguration
} 