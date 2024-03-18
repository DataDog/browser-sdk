import { objectValues, assign } from '../../tools/utils/polyfills'
import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder } from './endpointBuilder'
import { buildTags } from './tags'
import { INTAKE_SITE_FED_STAGING, INTAKE_SITE_US1 } from './intakeSites'

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
  const tags = buildTags(initConfiguration)

  const endpointBuilders = computeEndpointBuilders(initConfiguration, tags)
  const intakeUrlPrefixes = objectValues(endpointBuilders).map((builder) => builder.urlPrefix)

  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, intakeUrlPrefixes, tags)

  function isIntakeUrl(url: string) {
    return (
      getIntakePrefixesRegEx(initConfiguration).some((intakeRegEx) => intakeRegEx.test(url)) ||
      intakeUrlPrefixes.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0)
    )
  }

  return assign(
    {
      isIntakeUrl,
      replica: replicaConfiguration,
      site: initConfiguration.site || INTAKE_SITE_US1,
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

function getIntakePrefixesRegEx(initConfiguration: InitConfiguration): RegExp[] {
  const { site = INTAKE_SITE_US1, internalAnalyticsSubdomain } = initConfiguration

  const intakePrefixesRegEx: RegExp[] = []

  if (internalAnalyticsSubdomain) {
    intakePrefixesRegEx.push(new RegExp(`^https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/(logs|rum)`))
  }

  if (site === INTAKE_SITE_FED_STAGING) {
    intakePrefixesRegEx.push(new RegExp(`^https://http-intake.logs.${site}/api/v2/(logs|rum|replay)`))
  }

  if (site === INTAKE_SITE_US1) {
    intakePrefixesRegEx.push(new RegExp(`^https://(pci.)?browser-intake-${site}/api/v2/(logs|rum|replay)`))
  } else {
    const domainParts = site.split('.')
    const extension = domainParts.pop()
    intakePrefixesRegEx.push(
      new RegExp(`^https://browser-intake-${domainParts.join('-')}.${extension!}/api/v2/(logs|rum|replay)`)
    )
  }

  return intakePrefixesRegEx
}
