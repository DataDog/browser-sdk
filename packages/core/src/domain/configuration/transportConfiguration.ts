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
  const endpointBuilders = {
    logsEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'logs'),
    rumEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'rum'),
    sessionReplayEndpointBuilder: createEndpointBuilder(initConfiguration, buildEnv, 'sessionReplay'),
  }
  const intakeEndpoints: string[] = objectValues(endpointBuilders).map((builder) => builder.buildIntakeUrl())

  const configuration: TransportConfiguration = {
    isIntakeUrl: (url) => intakeEndpoints.some((intakeEndpoint) => url.indexOf(intakeEndpoint) === 0),
    ...endpointBuilders,
  }

  if (initConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpointBuilder = createEndpointBuilder(
      initConfiguration,
      buildEnv,
      'logs',
      'browser-agent-internal-monitoring'
    )
  }

  if (buildEnv.buildMode === BuildMode.E2E_TEST) {
    const e2eEndpointBuilder = (placeholder: string) => ({ build: () => placeholder } as EndpointBuilder)
    configuration.internalMonitoringEndpointBuilder = e2eEndpointBuilder('<<< E2E INTERNAL MONITORING ENDPOINT >>>')
    configuration.logsEndpointBuilder = e2eEndpointBuilder('<<< E2E LOGS ENDPOINT >>>')
    configuration.rumEndpointBuilder = e2eEndpointBuilder('<<< E2E RUM ENDPOINT >>>')
    configuration.sessionReplayEndpointBuilder = e2eEndpointBuilder('<<< E2E SESSION REPLAY ENDPOINT >>>')
  }

  if (buildEnv.buildMode === BuildMode.STAGING && initConfiguration.replica !== undefined) {
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
    configuration.replica = { applicationId: initConfiguration.replica.applicationId, ...replicaEndpointBuilders }

    const replicaIntakeEndpoints: string[] = objectValues(replicaEndpointBuilders).map((builder) =>
      builder.buildIntakeUrl()
    )

    intakeEndpoints.push(...replicaIntakeEndpoints)
  }

  return configuration
}
