import { BuildEnv, BuildMode } from '../../boot/init'
import { objectValues } from '../../tools/utils'
import { InitConfiguration } from './configuration'
import { createEndpointBuilder, INTAKE_SITE_US, EndpointBuilder } from './endpointBuilder'

export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  internalMonitoringEndpointBuilder?: EndpointBuilder
  isIntakeUrl: (url: string) => boolean
  // only on staging build mode
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
  const endpointBuilders = computeEndpointBuilders(initConfiguration, buildEnv)
  const intakeEndpoints = objectValues(endpointBuilders).map((builder) => builder.buildIntakeUrl())

  const replicaConfiguration = computeReplicaConfiguration(initConfiguration, buildEnv, intakeEndpoints)

  return {
    isIntakeUrl: (url) => intakeEndpoints.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0),
    ...endpointBuilders,
    replica: replicaConfiguration,
  }
}

function computeEndpointBuilders(initConfiguration: InitConfiguration, buildEnv: BuildEnv) {
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
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'rum'),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'sessionReplay'),
  }

  if (initConfiguration.internalMonitoringApiKey) {
    return {
      ...endpointBuilders,
      internalMonitoringEndpointBuilder: createEndpointBuilder(
        { ...initConfiguration, clientToken: initConfiguration.internalMonitoringApiKey },
        buildEnv,
        'logs',
        'browser-agent-internal-monitoring'
      ),
    }
  }

  return endpointBuilders
}

function computeReplicaConfiguration(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv,
  intakeEndpoints: string[]
): ReplicaConfiguration | undefined {
  if (buildEnv.buildMode !== BuildMode.STAGING || initConfiguration.replica === undefined) {
    return
  }

  const replicaConfiguration: InitConfiguration = {
    ...initConfiguration,
    site: INTAKE_SITE_US,
    applicationId: initConfiguration.replica.applicationId,
    clientToken: initConfiguration.replica.clientToken,
    useAlternateIntakeDomains: true,
    intakeApiVersion: 2,
  }

  const replicaEndpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(replicaConfiguration, buildEnv, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(replicaConfiguration, buildEnv, 'rum'),
    internalMonitoringEndpointBuilder: createEndpointBuilder(
      replicaConfiguration,
      buildEnv,
      'logs',
      'browser-agent-internal-monitoring'
    ),
  }

  intakeEndpoints.push(...objectValues(replicaEndpointBuilders).map((builder) => builder.buildIntakeUrl()))

  return { applicationId: initConfiguration.replica.applicationId, ...replicaEndpointBuilders }
}
