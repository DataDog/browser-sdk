import type { BuildEnv } from '../../boot/init'
import { BuildMode } from '../../boot/init'
import { assign, objectValues } from '../../tools/utils'
import type { InitConfiguration } from './configuration'
import type { EndpointBuilder } from './endpointBuilder'
import { createEndpointBuilder, INTAKE_SITE_US } from './endpointBuilder'
import { buildTags } from './tags'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  internalMonitoringEndpointBuilder?: EndpointBuilder
  isIntakeUrl: (url: string) => boolean
  replica?: ReplicaConfiguration
}

export interface ReplicaConfiguration {
  applicationId?: string
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  internalMonitoringEndpointBuilder: EndpointBuilder
}

export function computeTransportConfiguration(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv
): TransportConfiguration {
  const tags = buildTags(initConfiguration)

  const endpointBuilders = computeEndpointBuilders(initConfiguration, buildEnv, tags)
  const intakeEndpoints = objectValues(endpointBuilders).map((builder) => builder.buildIntakeUrl())

  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, buildEnv, intakeEndpoints, tags)

  return assign(
    {
      isIntakeUrl: (url: string) => intakeEndpoints.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0),
      replica: replicaConfiguration,
    },
    endpointBuilders
  )
}

function computeEndpointBuilders(initConfiguration: InitConfiguration, buildEnv: BuildEnv, tags: string[]) {
  if (buildEnv.buildMode === BuildMode.E2E_TEST) {
    const e2eEndpointBuilder = (placeholder: string) => ({
      build: () => placeholder,
      buildIntakeUrl: () => placeholder,
    })

    return {
      logsEndpointBuilder: e2eEndpointBuilder('<<< E2E LOGS ENDPOINT >>>'),
      rumEndpointBuilder: e2eEndpointBuilder('<<< E2E RUM ENDPOINT >>>'),
      sessionReplayEndpointBuilder: e2eEndpointBuilder('<<< E2E SESSION REPLAY ENDPOINT >>>'),
      internalMonitoringEndpointBuilder: e2eEndpointBuilder('<<< E2E INTERNAL MONITORING ENDPOINT >>>'),
    }
  }

  const endpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'logs', tags),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'rum', tags),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'sessionReplay', tags),
  }

  if (initConfiguration.internalMonitoringApiKey) {
    return assign(endpointBuilders, {
      internalMonitoringEndpointBuilder: createEndpointBuilder(
        assign({}, initConfiguration, { clientToken: initConfiguration.internalMonitoringApiKey }),
        buildEnv,
        'logs',
        tags,
        'browser-agent-internal-monitoring'
      ),
    })
  }

  return endpointBuilders
}

function computeReplicaConfiguration(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv,
  intakeEndpoints: string[],
  tags: string[]
): ReplicaConfiguration | undefined {
  if (!initConfiguration.replica) {
    return
  }

  const replicaConfiguration: InitConfiguration = assign({}, initConfiguration, {
    site: INTAKE_SITE_US,
    clientToken: initConfiguration.replica.clientToken,
  })

  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, buildEnv, 'logs', tags),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, buildEnv, 'rum', tags),
    internalMonitoringEndpointBuilder: createEndpointBuilder(
      replicaConfiguration,
      buildEnv,
      'logs',
      tags,
      'browser-agent-internal-monitoring'
    ),
  }

  intakeEndpoints.push(...objectValues(replicaEndpointBuilders).map((builder) => builder.buildIntakeUrl()))

  return assign({ applicationId: initConfiguration.replica.applicationId }, replicaEndpointBuilders)
}
