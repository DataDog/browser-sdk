import {
  BoundedBuffer,
  assign,
  canUseEventBridge,
  createTrackingConsentState,
  display,
  displayAlreadyInitializedError,
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
  doStartLogs: (initConfiguration: LogsInitConfiguration, configuration: LogsConfiguration) => StartLogsResult
): Strategy {
  const bufferApiCalls = new BoundedBuffer<StartLogsResult>()
  let cachedInitConfiguration: LogsInitConfiguration | undefined
  let cachedConfiguration: LogsConfiguration | undefined
  const trackingConsentState = createTrackingConsentState()
  trackingConsentState.observable.subscribe(tryStartLogs)

  function tryStartLogs() {
    if (!cachedConfiguration || !cachedInitConfiguration || !trackingConsentState.isGranted()) {
      return
    }

    const startLogsResult = doStartLogs(cachedInitConfiguration, cachedConfiguration)

    bufferApiCalls.drain(startLogsResult)
  }

  return {
    init(initConfiguration) {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }

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

    setTrackingConsent: trackingConsentState.update,

    get initConfiguration() {
      return cachedInitConfiguration
    },

    getInternalContext: noop as () => undefined,

    handleLog(message, statusType, context = getCommonContext(), date = timeStampNow()) {
      bufferApiCalls.add((startLogsResult) => startLogsResult.handleLog(message, statusType, context, date))
    },
  }
}

function overrideInitConfigurationForBridge(initConfiguration: LogsInitConfiguration): LogsInitConfiguration {
  return assign({}, initConfiguration, { clientToken: 'empty' })
}
