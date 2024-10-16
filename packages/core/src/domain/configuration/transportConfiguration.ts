import { objectValues, assign } from '../../tools/utils/polyfills'
import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'
import { buildTags } from './tags'
import { INTAKE_SITE_US1 } from './intakeSites'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  isIntakeUrl: (url: string) => boolean
  replica?: ReplicaConfiguration
  site: string
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
  const intakeUrlPrefixes = objectValues(endpointBuilders).map((builder) => builder.urlPrefix)

  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, intakeUrlPrefixes, tags)

  return assign(
    {
      isIntakeUrl: (url: string) => hasIntakeParameters(url),
      replica: replicaConfiguration,
      site,
    },
    endpointBuilders
  )
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
  intakeUrlPrefixes: string[],
  tags: string[]
): ReplicaConfiguration | undefined {
  if (!initConfiguration.replica) {
    return
  }

  const replicaConfiguration: InitConfiguration = assign({}, initConfiguration, {
    site: INTAKE_SITE_US1,
    clientToken: initConfiguration.replica.clientToken,
  })

  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'logs', tags),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, 'rum', tags),
  }

  intakeUrlPrefixes.push(...objectValues(replicaEndpointBuilders).map((builder) => builder.urlPrefix))

  return assign({ applicationId: initConfiguration.replica.applicationId }, replicaEndpointBuilders)
}

function hasIntakeParameters(url: string) {
  // check if tags is present in the query string
  return url.indexOf('ddsource') !== -1 || url.indexOf('ddtags') !== -1
}
