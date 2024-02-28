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
  spotlight?: SpotlightConfiguration
  site: string
}

export interface ReplicaConfiguration {
  applicationId?: string
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
}

export interface SpotlightConfiguration extends Omit<ReplicaConfiguration, 'applicationId'> {
  contentType: string
}

export function computeTransportConfiguration(initConfiguration: InitConfiguration): TransportConfiguration {
  const tags = buildTags(initConfiguration)

  const endpointBuilders = computeEndpointBuilders(initConfiguration, tags)
  const intakeUrlPrefixes = objectValues(endpointBuilders).map((builder) => builder.urlPrefix)

  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, intakeUrlPrefixes, tags)

  const spotlightConfiguration = computeSpotlightConfiguration(initConfiguration, intakeUrlPrefixes, tags)

  return assign(
    {
      isIntakeUrl: (url: string) => intakeUrlPrefixes.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0),
      replica: replicaConfiguration,
      site: initConfiguration.site || INTAKE_SITE_US1,
      spotlight: spotlightConfiguration,
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

function computeSpotlightConfiguration(
  initConfiguration: InitConfiguration,
  intakeUrlPrefixes: string[],
  tags: string[]
): SpotlightConfiguration | undefined {
  if (!initConfiguration.spotlight) {
    return
  }

  const spotlightConfiguration: InitConfiguration = assign({}, initConfiguration, {
    site: 'localhost:8969',
  })

  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(spotlightConfiguration, 'logs', tags),
    rumEndpointBuilder: createEndpointBuilder(spotlightConfiguration, 'rum', tags),
  }

  intakeUrlPrefixes.push(...objectValues(replicaEndpointBuilders).map((builder) => builder.urlPrefix))

  return assign({ contentType: 'application/x-datadog-spotlight' }, replicaEndpointBuilders)
}
