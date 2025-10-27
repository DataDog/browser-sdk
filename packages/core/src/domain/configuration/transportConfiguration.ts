import type { Site } from '../intakeSites'
import { INTAKE_SITE_US1, INTAKE_URL_PARAMETERS } from '../intakeSites'
import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  profilingEndpointBuilder: EndpointBuilder
  exposuresEndpointBuilder: EndpointBuilder
  datacenter?: string | undefined
  replica?: ReplicaConfiguration
  site: Site
  source: 'browser' | 'flutter' | 'unity'
}

export interface ReplicaConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
}

export function computeTransportConfiguration(initConfiguration: InitConfiguration): TransportConfiguration {
  const site = initConfiguration.site || INTAKE_SITE_US1
  const source = validateSource(initConfiguration.source)

  const endpointBuilders = computeEndpointBuilders({ ...initConfiguration, site, source })
  const replicaConfiguration = computeReplicaConfiguration({ ...initConfiguration, site, source })

  return {
    replica: replicaConfiguration,
    site,
    source,
    ...endpointBuilders,
  }
}

function validateSource(source: string | undefined) {
  if (source === 'flutter' || source === 'unity') {
    return source
  }
  return 'browser'
}

function computeEndpointBuilders(initConfiguration: InitConfiguration) {
  return {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, 'rum'),
    profilingEndpointBuilder: createEndpointBuilder(initConfiguration, 'profile'),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, 'replay'),
    exposuresEndpointBuilder: createEndpointBuilder(initConfiguration, 'exposures'),
  }
}

function computeReplicaConfiguration(initConfiguration: InitConfiguration): ReplicaConfiguration | undefined {
  if (!initConfiguration.replica) {
    return
  }

  const replicaConfiguration: InitConfiguration = {
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
