import { BuildEnv, BuildMode } from '../../boot/init'
import { InitConfiguration } from './configuration'
import { createEndpointBuilder, ENDPOINTS_TYPES, INTAKE_SITE_US } from './endpointBuilder'

export interface TransportConfiguration {
  logsEndpoint: string
  rumEndpoint: string
  sessionReplayEndpoint: string
  internalMonitoringEndpoint?: string
  isIntakeUrl: (url: string) => boolean

  // only on staging build mode
  replica?: ReplicaConfiguration
}

export interface ReplicaConfiguration {
  applicationId?: string
  logsEndpoint: string
  rumEndpoint: string
  internalMonitoringEndpoint: string
}

export function computeTransportConfiguration(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv,
  isIntakeV2Enabled?: boolean
): TransportConfiguration {
  const endpointBuilder = createEndpointBuilder(initConfiguration, buildEnv, isIntakeV2Enabled)
  const intakeUrls: string[] = ENDPOINTS_TYPES.map((endpointType) => endpointBuilder.buildIntakeUrl(endpointType))

  const configuration: TransportConfiguration = {
    isIntakeUrl: (url: string) => intakeUrls.some((intakeUrl) => url.indexOf(intakeUrl) === 0),
    logsEndpoint: endpointBuilder.build('logs'),
    rumEndpoint: endpointBuilder.build('rum'),
    sessionReplayEndpoint: endpointBuilder.build('sessionReplay'),
  }

  if (initConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = endpointBuilder.build('logs', 'browser-agent-internal-monitoring')
  }

  if (buildEnv.buildMode === BuildMode.E2E_TEST) {
    configuration.internalMonitoringEndpoint = '<<< E2E INTERNAL MONITORING ENDPOINT >>>'
    configuration.logsEndpoint = '<<< E2E LOGS ENDPOINT >>>'
    configuration.rumEndpoint = '<<< E2E RUM ENDPOINT >>>'
    configuration.sessionReplayEndpoint = '<<< E2E SESSION REPLAY ENDPOINT >>>'
  }

  if (buildEnv.buildMode === BuildMode.STAGING && initConfiguration.replica !== undefined) {
    const replicaConfiguration = {
      ...initConfiguration,
      site: INTAKE_SITE_US,
      applicationId: initConfiguration.replica.applicationId,
      clientToken: initConfiguration.replica.clientToken,
      useAlternateIntakeDomains: true,
      intakeApiVersion: isIntakeV2Enabled ? 2 : (1 as 1 | 2),
    }
    const replicaEndpointBuilder = createEndpointBuilder(replicaConfiguration, buildEnv, isIntakeV2Enabled)

    configuration.replica = {
      applicationId: initConfiguration.replica.applicationId,
      internalMonitoringEndpoint: replicaEndpointBuilder.build('logs', 'browser-agent-internal-monitoring'),
      logsEndpoint: replicaEndpointBuilder.build('logs'),
      rumEndpoint: replicaEndpointBuilder.build('rum'),
    }

    const replicaIntakeUrls = ENDPOINTS_TYPES.map((endpointType) => replicaEndpointBuilder.buildIntakeUrl(endpointType))
    replicaIntakeUrls.forEach((replicaIntakeUrl) => intakeUrls.push(replicaIntakeUrl))
    intakeUrls.push(...replicaIntakeUrls)
  }

  return configuration
}
