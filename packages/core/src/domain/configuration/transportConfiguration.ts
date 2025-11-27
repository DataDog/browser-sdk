import { INTAKE_SITE_US1 } from '../intakeSites'
import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  profilingEndpointBuilder: EndpointBuilder
  exposuresEndpointBuilder: EndpointBuilder
  replicaEndpointBuilders?: ReplicaConfiguration
}

export interface ReplicaConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
}

export function computeTransportConfiguration(initConfiguration: InitConfiguration): TransportConfiguration {
  const endpointBuilders = computeEndpointBuilders(initConfiguration)
  const replicaConfiguration = computeReplicaConfiguration(initConfiguration)

  return {
    replicaEndpointBuilders: replicaConfiguration,
    ...endpointBuilders,
  }
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
