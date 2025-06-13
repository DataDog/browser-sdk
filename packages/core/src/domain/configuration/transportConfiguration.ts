import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'
import type { Site } from './intakeSites'
import { INTAKE_SITE_US1, INTAKE_URL_PARAMETERS } from './intakeSites'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  profilingEndpointBuilder: EndpointBuilder
  replica?: ReplicaConfiguration
  site: Site
}

export interface ReplicaConfiguration {
  applicationId?: string
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
}

export function computeTransportConfiguration(initConfiguration: InitConfiguration): TransportConfiguration {
  const site = initConfiguration.site || INTAKE_SITE_US1

  const endpointBuilders = computeEndpointBuilders(initConfiguration)
  const replicaConfiguration = computeReplicaConfiguration(initConfiguration)

  return {
    replica: replicaConfiguration,
    site,
    ...endpointBuilders,
  }
}

function computeEndpointBuilders(initConfiguration: InitConfiguration) {
  return {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, 'rum'),
    profilingEndpointBuilder: createEndpointBuilder(initConfiguration, 'profile'),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, 'replay'),
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

  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'rum'),
  }

  return { applicationId: initConfiguration.replica.applicationId, ...replicaEndpointBuilders }
}

export function isIntakeUrl(url: string): boolean {
  // check if tags is present in the query string
  return INTAKE_URL_PARAMETERS.every((param) => url.includes(param))
}
