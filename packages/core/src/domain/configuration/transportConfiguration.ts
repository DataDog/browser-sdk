import type { Site } from '../intakeSites'
import { INTAKE_SITE_US1, INTAKE_URL_PARAMETERS } from '../intakeSites'
import type { InitConfiguration, SdkSource } from './configuration'
import type { EndpointBuilder, TransportSource } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  profilingEndpointBuilder: EndpointBuilder
  exposuresEndpointBuilder: EndpointBuilder
  flagEvaluationEndpointBuilder: EndpointBuilder
  debuggerEndpointBuilder: EndpointBuilder
  datacenter?: string | undefined
  replica?: ReplicaConfiguration
  site: Site
  source: SdkSource
}

export interface ReplicaConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
}

// Internal: init configuration once the transport source has been resolved
// (validated user value or `sourceOverride` from `computeTransportConfiguration`).
type ResolvedSourceInitConfiguration = Omit<InitConfiguration, 'source'> & {
  source: TransportSource
}

/**
 * Compute the transport configuration (endpoint builders, replica, etc.) for an
 * SDK init configuration.
 *
 * `sourceOverride` (if provided) is only used to build the `ddsource` URL
 * parameter on outgoing requests; it does not appear on the returned
 * `TransportConfiguration.source`, which is always the validated `SdkSource`
 * derived from `initConfiguration.source`.
 */
export function computeTransportConfiguration(
  initConfiguration: InitConfiguration,
  sourceOverride?: TransportSource
): TransportConfiguration {
  const site = initConfiguration.site || INTAKE_SITE_US1
  const source = validateSource(initConfiguration.source)
  const transportSource: TransportSource = sourceOverride ?? source

  const resolvedConfiguration: ResolvedSourceInitConfiguration = {
    ...initConfiguration,
    site,
    source: transportSource,
  }
  const endpointBuilders = computeEndpointBuilders(resolvedConfiguration)
  const replicaConfiguration = computeReplicaConfiguration(resolvedConfiguration)

  return {
    replica: replicaConfiguration,
    site,
    source,
    ...endpointBuilders,
  }
}

function validateSource(source: string | undefined): SdkSource {
  if (source === 'flutter' || source === 'unity') {
    return source
  }
  return 'browser'
}

function computeEndpointBuilders(initConfiguration: ResolvedSourceInitConfiguration) {
  return {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, 'rum'),
    profilingEndpointBuilder: createEndpointBuilder(initConfiguration, 'profile'),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, 'replay'),
    exposuresEndpointBuilder: createEndpointBuilder(initConfiguration, 'exposures'),
    flagEvaluationEndpointBuilder: createEndpointBuilder(initConfiguration, 'flagevaluation'),
    debuggerEndpointBuilder: createEndpointBuilder(initConfiguration, 'debugger'),
  }
}

function computeReplicaConfiguration(
  initConfiguration: ResolvedSourceInitConfiguration
): ReplicaConfiguration | undefined {
  if (!initConfiguration.replica) {
    return
  }

  const replicaConfiguration: ResolvedSourceInitConfiguration = {
    ...initConfiguration,
    site: INTAKE_SITE_US1,
    clientToken: initConfiguration.replica.clientToken,
  }

  return {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'rum', [
      `application.id=${initConfiguration.replica.applicationId}`,
    ]),
  }
}

export function isIntakeUrl(url: string): boolean {
  // check if tags is present in the query string
  return INTAKE_URL_PARAMETERS.every((param) => url.includes(param))
}
