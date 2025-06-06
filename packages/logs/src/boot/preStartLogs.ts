import type { TrackingConsentState } from '@datadog/browser-core'
import {
  createBoundedBuffer,
  canUseEventBridge,
  display,
  displayAlreadyInitializedError,
  initFeatureFlags,
  initFetchObservable,
  noop,
  timeStampNow,
  buildAccountContextManager,
  CustomerContextKey,
  bufferContextCalls,
  buildGlobalContextManager,
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
  const bufferApiCalls = createBoundedBuffer<StartLogsResult>()

  // TODO next major: remove the globalContext, accountContextManager from preStartStrategy and use an empty context instead
  const globalContext = buildGlobalContextManager()
  bufferContextCalls(globalContext, CustomerContextKey.globalContext, bufferApiCalls)

  const accountContext = buildAccountContextManager()
  bufferContextCalls(accountContext, CustomerContextKey.accountContext, bufferApiCalls)

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
      // Instrumuent fetch to track network requests
      // This is needed in case the consent is not granted and some cutsomer
      // library (Apollo Client) is storing uninstrumented fetch to be used later
      // The subscrption is needed so that the instrumentation process is completed
      initFetchObservable().subscribe(noop)

      trackingConsentState.tryToInit(configuration.trackingConsent)
      tryStartLogs()
    },

    get initConfiguration() {
      return cachedInitConfiguration
    },

    globalContext,
    accountContext,

    getInternalContext: noop as () => undefined,

    handleLog(message, statusType, handlingStack, context = getCommonContext(), date = timeStampNow()) {
      bufferApiCalls.add((startLogsResult) =>
        startLogsResult.handleLog(message, statusType, handlingStack, context, date)
      )
    },
  }
}

function overrideInitConfigurationForBridge(initConfiguration: LogsInitConfiguration): LogsInitConfiguration {
  return { ...initConfiguration, clientToken: 'empty' }
}
