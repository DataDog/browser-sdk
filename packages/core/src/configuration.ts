import { BuildEnv, Datacenter, Environment } from './init'
import { ONE_KILO_BYTE, ONE_SECOND } from './utils'

export const DEFAULT_CONFIGURATION = {
  enableExperimentalFeatures: false,
  isCollectingError: true,
  maxErrorsByMinute: 3000,
  maxInternalMonitoringMessagesPerPage: 15,
  resourceSampleRate: 100,
  sampleRate: 100,

  /**
   * arbitrary value, byte precision not needed
   */
  requestErrorResponseLengthLimit: 32 * ONE_KILO_BYTE,

  /**
   * flush automatically, aim to be lower than ALB connection timeout
   * to maximize connection reuse.
   */
  flushTimeout: 30 * ONE_SECOND,

  /**
   * Logs intake limit
   */
  maxBatchSize: 50,
  maxMessageSize: 256 * ONE_KILO_BYTE,

  /**
   * beacon payload max queue size implementation is 64kb
   * ensure that we leave room for logs, rum and potential other users
   */
  batchBytesLimit: 16 * ONE_KILO_BYTE,
}

export interface UserConfiguration {
  publicApiKey?: string // deprecated
  clientToken: string
  internalMonitoringApiKey?: string
  isCollectingError?: boolean
  sampleRate?: number
  resourceSampleRate?: number
  datacenter?: Datacenter
  enableExperimentalFeatures?: boolean

  // Below is only taken into account for e2e-test bundle.
  internalMonitoringEndpoint?: string
  logsEndpoint?: string
  rumEndpoint?: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION & {
  logsEndpoint: string
  rumEndpoint: string
  traceEndpoint: string
  internalMonitoringEndpoint?: string
}

interface TransportConfiguration {
  clientToken: string
  datacenter: Datacenter
  env: Environment
  version: string
}

export function buildConfiguration(userConfiguration: UserConfiguration, buildEnv: BuildEnv): Configuration {
  const transportConfiguration: TransportConfiguration = {
    clientToken: userConfiguration.clientToken,
    datacenter: userConfiguration.datacenter || buildEnv.datacenter,
    env: buildEnv.env,
    version: buildEnv.version,
  }

  const configuration: Configuration = {
    logsEndpoint: getEndpoint('browser', transportConfiguration),
    rumEndpoint: getEndpoint('rum', transportConfiguration),
    traceEndpoint: getEndpoint('public-trace', transportConfiguration),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      'browser',
      transportConfiguration,
      'browser-agent-internal-monitoring'
    )
  }

  if ('isCollectingError' in userConfiguration) {
    configuration.isCollectingError = !!userConfiguration.isCollectingError
  }

  if ('sampleRate' in userConfiguration) {
    configuration.sampleRate = userConfiguration.sampleRate!
  }

  if ('resourceSampleRate' in userConfiguration) {
    configuration.resourceSampleRate = userConfiguration.resourceSampleRate!
  }

  if ('enableExperimentalFeatures' in userConfiguration) {
    configuration.enableExperimentalFeatures = userConfiguration.enableExperimentalFeatures!
  }

  if (transportConfiguration.env === 'e2e-test') {
    if (userConfiguration.internalMonitoringEndpoint !== undefined) {
      configuration.internalMonitoringEndpoint = userConfiguration.internalMonitoringEndpoint
    }
    if (userConfiguration.logsEndpoint !== undefined) {
      configuration.logsEndpoint = userConfiguration.logsEndpoint
    }
    if (userConfiguration.rumEndpoint !== undefined) {
      configuration.rumEndpoint = userConfiguration.rumEndpoint
    }
  }

  return configuration
}

function getEndpoint(type: string, conf: TransportConfiguration, source?: string) {
  const tld = conf.datacenter === 'us' ? 'com' : 'eu'
  const domain = conf.env === 'production' ? `datadoghq.${tld}` : `datad0g.${tld}`
  const tags = `version:${conf.version}`
  return `https://${type}-http-intake.logs.${domain}/v1/input/${conf.clientToken}?ddsource=${source ||
    'browser'}&ddtags=${tags}`
}
