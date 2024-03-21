import { objectValues, assign } from '../../tools/utils/polyfills'
import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'
import { buildTags } from './tags'
import { INTAKE_SITE_US1, PCI_INTAKE_HOST_US1 } from './intakeSites'

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
  const intakeUrlPrefixes = computeIntakeUrlPrefixes(endpointBuilders, site)

  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, intakeUrlPrefixes, tags)

  return assign(
    {
      isIntakeUrl: (url: string) => intakeUrlPrefixes.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0),
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

function computeIntakeUrlPrefixes(
  endpointBuilders: ReturnType<typeof computeEndpointBuilders>,
  site: string
): string[] {
  const intakeUrlPrefixes = objectValues(endpointBuilders).map((builder) => builder.urlPrefix)

  if (site === INTAKE_SITE_US1) {
    intakeUrlPrefixes.push(`https://${PCI_INTAKE_HOST_US1}/`)
  }

  return intakeUrlPrefixes
}
