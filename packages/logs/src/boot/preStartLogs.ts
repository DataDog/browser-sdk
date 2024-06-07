import type { TrackingConsentState } from '@datadog/browser-core'
import {
  BoundedBuffer,
  assign,
  canUseEventBridge,
  display,
  displayAlreadyInitializedError,
  initFeatureFlags,
  noop,
  timeStampNow,
} from '@datadog/browser-core'
import {
  validateAndBuildLogsConfiguration,
  type LogsConfiguration,
  type LogsInitConfiguration,
} from '../domain/configuration'
import type { CommonContext } from '../rawLogsEvent.types'
import type { Strategy } from './logsPublicApi'
import type { StartLogsResult } from './startLogs'

export function createPreStartStrategy(
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState,
  doStartLogs: (initConfiguration: LogsInitConfiguration, configuration: LogsConfiguration) => StartLogsResult
): Strategy {
  const bufferApiCalls = new BoundedBuffer<StartLogsResult>()
  let cachedInitConfiguration: LogsInitConfiguration | undefined
  let cachedConfiguration: LogsConfiguration | undefined
  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartLogs)

  function tryStartLogs() {
    if (!cachedConfiguration || !cachedInitConfiguration || !trackingConsentState.isGranted()) {
      return
    }

    trackingConsentStateSubscription.unsubscribe()
    const startLogsResult = doStartLogs(cachedInitConfiguration, cachedConfiguration)

    bufferApiCalls.drain(startLogsResult)
  }

  return {
    init(initConfiguration) {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }
      // Set the experimental feature flags as early as possible, so we can use them in most places
      initFeatureFlags(initConfiguration.enableExperimentalFeatures)

      if (canUseEventBridge()) {
        initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
      }

      // Expose the initial configuration regardless of initialization success.
      cachedInitConfiguration = initConfiguration

      if (cachedConfiguration) {
        displayAlreadyInitializedError('DD_LOGS', initConfiguration)
        return
      }

      const configuration = validateAndBuildLogsConfiguration(initConfiguration)
      if (!configuration) {
        return
      }

      cachedConfiguration = configuration
      trackingConsentState.tryToInit(configuration.trackingConsent)
      tryStartLogs()
    },

    get initConfiguration() {
      return cachedInitConfiguration
    },

    getInternalContext: noop as () => undefined,

    handleLog(message, statusType, handlingStack, context = getCommonContext(), date = timeStampNow()) {
      bufferApiCalls.add((startLogsResult) =>
        startLogsResult.handleLog(message, statusType, handlingStack, context, date)
      )
    },
  }
}

function overrideInitConfigurationForBridge(initConfiguration: LogsInitConfiguration): LogsInitConfiguration {
  return assign({}, initConfiguration, { clientToken: 'empty' })
}
