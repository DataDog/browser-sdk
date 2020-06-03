import { BuildEnv, BuildMode, Datacenter, Environment } from './init'
import { includes, ONE_KILO_BYTE, ONE_SECOND } from './utils'

export const DEFAULT_CONFIGURATION = {
  isCollectingError: true,
  maxErrorsByMinute: 3000,
  maxInternalMonitoringMessagesPerPage: 15,
  resourceSampleRate: 100,
  sampleRate: 100,
  silentMultipleInit: false,
  trackInteractions: false,

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
  applicationId?: string
  internalMonitoringApiKey?: string
  isCollectingError?: boolean
  sampleRate?: number
  resourceSampleRate?: number
  datacenter?: Datacenter
  enableExperimentalFeatures?: string[]
  silentMultipleInit?: boolean
  trackInteractions?: boolean
  proxyHost?: string

  service?: string
  env?: string
  version?: string

  // Below is only taken into account for e2e-test build mode.
  internalMonitoringEndpoint?: string
  logsEndpoint?: string
  rumEndpoint?: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION & {
  logsEndpoint: string
  rumEndpoint: string
  traceEndpoint: string
  internalMonitoringEndpoint?: string

  isEnabled: (feature: string) => boolean
}

interface TransportConfiguration {
  clientToken: string
  datacenter: Datacenter
  sdkEnv: Environment
  buildMode: BuildMode
  sdkVersion: string
  applicationId?: string
  proxyHost?: string

  service?: string
  env?: string
  version?: string
}

export function buildConfiguration(userConfiguration: UserConfiguration, buildEnv: BuildEnv): Configuration {
  const transportConfiguration: TransportConfiguration = {
    applicationId: userConfiguration.applicationId,
    buildMode: buildEnv.buildMode,
    clientToken: userConfiguration.clientToken,
    datacenter: userConfiguration.datacenter || buildEnv.datacenter,
    env: userConfiguration.env,
    proxyHost: userConfiguration.proxyHost,
    sdkEnv: buildEnv.sdkEnv,
    sdkVersion: buildEnv.sdkVersion,
    service: userConfiguration.service,
    version: userConfiguration.version,
  }

  const enableExperimentalFeatures = Array.isArray(userConfiguration.enableExperimentalFeatures)
    ? userConfiguration.enableExperimentalFeatures
    : []

  const configuration: Configuration = {
    isEnabled: (feature: string) => {
      return includes(enableExperimentalFeatures, feature)
    },
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

  if ('trackInteractions' in userConfiguration) {
    configuration.trackInteractions = !!userConfiguration.trackInteractions
  }

  if (transportConfiguration.buildMode === 'e2e-test') {
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
  const domain = conf.sdkEnv === 'production' ? `datadoghq.${tld}` : `datad0g.${tld}`
  const tags =
    `sdk_version:${conf.sdkVersion}` +
    `${conf.env ? `,env:${conf.env}` : ''}` +
    `${conf.service ? `,service:${conf.service}` : ''}` +
    `${conf.version ? `,version:${conf.version}` : ''}`
  const datadogHost = `${type}-http-intake.logs.${domain}`
  const host = conf.proxyHost ? conf.proxyHost : datadogHost
  const proxyParameter = conf.proxyHost ? `ddhost=${datadogHost}&` : ''
  const applicationIdParameter = conf.applicationId ? `_dd.application_id=${conf.applicationId}&` : ''
  const parameters = `${applicationIdParameter}${proxyParameter}ddsource=${source || 'browser'}&ddtags=${tags}`

  return `https://${host}/v1/input/${conf.clientToken}?${parameters}`
}
