import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'
import { buildTags } from './tags'
import type { SiteWithStaging } from './intakeSites'
import { INTAKE_SITE_US1, INTAKE_URL_PARAMETERS } from './intakeSites'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  replica?: ReplicaConfiguration
  site: SiteWithStaging
}

export interface ReplicaConfiguration {
  applicationId?: string
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
}

export function computeTransportConfiguration(initConfiguration: InitConfiguration): TransportConfiguration {
  const site = initConfiguration.site || INTAKE_SITE_US1

  const tags = buildTags(initConfiguration)

  const endpointBuilders = computeEndpointBuilders(initConfiguration, tags)
  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, tags)

  return {
    replica: replicaConfiguration,
    site,
    ...endpointBuilders,
  }
}

function computeEndpointBuilders(initConfiguration: InitConfiguration, tags: string[]) {
  return {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, 'logs', tags),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, 'rum', tags),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, 'replay', tags),
  }
}

function computeReplicaConfiguration(
  initConfiguration: InitConfiguration,
  tags: string[]
): ReplicaConfiguration | undefined {
  if (!initConfiguration.replica) {
    return
  }

  const replicaConfiguration: InitConfiguration = {
    ...initConfiguration,
    site: INTAKE_SITE_US1,
    clientToken: initConfiguration.replica.clientToken,
  }

  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'logs', tags),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'rum', tags),
  }

  return { applicationId: initConfiguration.replica.applicationId, ...replicaEndpointBuilders }
}

export function isIntakeUrl(url: string): boolean {
  // check if tags is present in the query string
  return INTAKE_URL_PARAMETERS.every((param) => url.includes(param))
}
