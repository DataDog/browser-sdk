import type { TrackingConsentState } from '@datadog/browser-core'
import {
  createBoundedBuffer,
  canUseEventBridge,
  display,
  displayAlreadyInitializedError,
  initFeatureFlags,
  noop,
  timeStampNow,
  buildAccountContextManager,
  CustomerContextKey,
  bufferContextCalls,
  addTelemetryConfiguration,
  buildGlobalContextManager,
  buildUserContextManager,
  setTimeout,
} from '@datadog/browser-core'
import {
  validateAndBuildExposureConfiguration,
  serializeExposureConfiguration,
  type ExposureConfiguration,
  type ExposureInitConfiguration,
} from '../domain/configuration'
import type { CommonContext } from '../rawExposureEvent.types'
import type { Strategy } from './exposurePublicApi'
import type { StartExposureResult } from './startExposure'

export function createPreStartStrategy(
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState,
  doStartExposure: (initConfiguration: ExposureInitConfiguration, configuration: ExposureConfiguration) => StartExposureResult
): Strategy {
  const bufferApiCalls = createBoundedBuffer<StartExposureResult>()

  const globalContext = buildGlobalContextManager()
  bufferContextCalls(globalContext, CustomerContextKey.globalContext, bufferApiCalls)

  const accountContext = buildAccountContextManager()
  bufferContextCalls(accountContext, CustomerContextKey.accountContext, bufferApiCalls)

  const userContext = buildUserContextManager()
  bufferContextCalls(userContext, CustomerContextKey.userContext, bufferApiCalls)

  let cachedInitConfiguration: ExposureInitConfiguration | undefined
  let cachedConfiguration: ExposureConfiguration | undefined
  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartExposure)

  function tryStartExposure() {
    if (!cachedConfiguration || !cachedInitConfiguration || !trackingConsentState.isGranted()) {
      return
    }

    trackingConsentStateSubscription.unsubscribe()
    const startExposureResult = doStartExposure(cachedInitConfiguration, cachedConfiguration)

    bufferApiCalls.drain(startExposureResult)
  }

  return {
    init(initConfiguration: ExposureInitConfiguration) {
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
      // FIXME temporary hack to avoid sending configuration without all the context data
      setTimeout(() => {
        addTelemetryConfiguration(serializeExposureConfiguration(initConfiguration))
      })

      if (cachedConfiguration) {
        displayAlreadyInitializedError('DD_LOGS', initConfiguration)
        return
      }

      const configuration = validateAndBuildExposureConfiguration(initConfiguration)
      if (!configuration) {
        return
      }

      cachedConfiguration = configuration

      trackingConsentState.tryToInit(configuration.trackingConsent)
      tryStartExposure()
    },

    get initConfiguration() {
      return cachedInitConfiguration
    },

    globalContext,
    accountContext,
    userContext,

    getInternalContext: noop as () => undefined,

    trackExposure(flagKey: string, flagValue: any, options = {}) {
      bufferApiCalls.add((startExposureResult) =>
        startExposureResult.trackExposure(flagKey, flagValue, options)
      )
    },
  }
}

function overrideInitConfigurationForBridge(initConfiguration: ExposureInitConfiguration): ExposureInitConfiguration {
  return { ...initConfiguration, clientToken: 'empty' }
} 