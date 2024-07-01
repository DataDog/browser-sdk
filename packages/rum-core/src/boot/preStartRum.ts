import {
  BoundedBuffer,
  display,
  canUseEventBridge,
  displayAlreadyInitializedError,
  willSyntheticsInjectRum,
  noop,
  timeStampNow,
  clocksNow,
  assign,
  getEventBridge,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  initFeatureFlags,
  addTelemetryConfiguration,
} from '@datadog/browser-core'
import type { TrackingConsentState, DeflateWorker } from '@datadog/browser-core'
import {
  validateAndBuildRumConfiguration,
  type RumConfiguration,
  type RumInitConfiguration,
} from '../domain/configuration'
import type { CommonContext } from '../domain/contexts/commonContext'
import type { ViewOptions } from '../domain/view/trackViews'
import { fetchAndApplyRemoteConfiguration, serializeRumConfiguration } from '../domain/configuration'
import { callPluginsMethod } from '../domain/plugins'
import type { RumPublicApiOptions, Strategy } from './rumPublicApi'
import type { StartRumResult } from './startRum'

export function createPreStartStrategy(
  { ignoreInitIfSyntheticsWillInjectRum, startDeflateWorker }: RumPublicApiOptions,
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState,
  doStartRum: (
    configuration: RumConfiguration,
    deflateWorker: DeflateWorker | undefined,
    initialViewOptions?: ViewOptions
  ) => StartRumResult
): Strategy {
  const bufferApiCalls = new BoundedBuffer<StartRumResult>()
  let firstStartViewCall:
    | { options: ViewOptions | undefined; callback: (startRumResult: StartRumResult) => void }
    | undefined
  let deflateWorker: DeflateWorker | undefined

  let cachedInitConfiguration: RumInitConfiguration | undefined
  let cachedConfiguration: RumConfiguration | undefined

  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartRum)

  function tryStartRum() {
    if (!cachedInitConfiguration || !cachedConfiguration || !trackingConsentState.isGranted()) {
      return
    }

    trackingConsentStateSubscription.unsubscribe()

    let initialViewOptions: ViewOptions | undefined

    if (cachedConfiguration.trackViewsManually) {
      if (!firstStartViewCall) {
        return
      }
      // An initial view is always created when starting RUM.
      // When tracking views automatically, any startView call before RUM start creates an extra
      // view.
      // When tracking views manually, we use the ViewOptions from the first startView call as the
      // initial view options, and we remove the actual startView call so we don't create an extra
      // view.
      bufferApiCalls.remove(firstStartViewCall.callback)
      initialViewOptions = firstStartViewCall.options
    }

    const startRumResult = doStartRum(cachedConfiguration, deflateWorker, initialViewOptions)

    bufferApiCalls.drain(startRumResult)
  }

  function doInit(initConfiguration: RumInitConfiguration) {
    const eventBridgeAvailable = canUseEventBridge()
    if (eventBridgeAvailable) {
      initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
    }

    // Update the exposed initConfiguration to reflect the bridge and remote configuration overrides
    cachedInitConfiguration = initConfiguration
    addTelemetryConfiguration(serializeRumConfiguration(initConfiguration))

    if (cachedConfiguration) {
      displayAlreadyInitializedError('DD_RUM', initConfiguration)
      return
    }

    const configuration = validateAndBuildRumConfiguration(initConfiguration)
    if (!configuration) {
      return
    }

    if (!eventBridgeAvailable && !configuration.sessionStoreStrategyType) {
      display.warn('No storage available for session. We will not send any data.')
      return
    }

    if (configuration.compressIntakeRequests && !eventBridgeAvailable && startDeflateWorker) {
      deflateWorker = startDeflateWorker(
        configuration,
        'Datadog RUM',
        // Worker initialization can fail asynchronously, especially in Firefox where even CSP
        // issues are reported asynchronously. For now, the SDK will continue its execution even if
        // data won't be sent to Datadog. We could improve this behavior in the future.
        noop
      )
      if (!deflateWorker) {
        // `startDeflateWorker` should have logged an error message explaining the issue
        return
      }
    }

    cachedConfiguration = configuration
    trackingConsentState.tryToInit(configuration.trackingConsent)
    tryStartRum()
  }

  return {
    init(initConfiguration, publicApi) {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }
      // Set the experimental feature flags as early as possible, so we can use them in most places
      initFeatureFlags(initConfiguration.enableExperimentalFeatures)

      // Expose the initial configuration regardless of initialization success.
      cachedInitConfiguration = initConfiguration

      // If we are in a Synthetics test configured to automatically inject a RUM instance, we want
      // to completely discard the customer application RUM instance by ignoring their init() call.
      // But, we should not ignore the init() call from the Synthetics-injected RUM instance, so the
      // internal `ignoreInitIfSyntheticsWillInjectRum` option is here to bypass this condition.
      if (ignoreInitIfSyntheticsWillInjectRum && willSyntheticsInjectRum()) {
        return
      }

      if (isExperimentalFeatureEnabled(ExperimentalFeature.PLUGINS)) {
        callPluginsMethod(initConfiguration.plugins, 'onInit', { initConfiguration, publicApi })
      }

      if (
        initConfiguration.remoteConfigurationId &&
        isExperimentalFeatureEnabled(ExperimentalFeature.REMOTE_CONFIGURATION)
      ) {
        fetchAndApplyRemoteConfiguration(initConfiguration, doInit)
      } else {
        doInit(initConfiguration)
      }
    },

    get initConfiguration() {
      return cachedInitConfiguration
    },

    getInternalContext: noop as () => undefined,

    stopSession: noop,

    addTiming(name, time = timeStampNow()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addTiming(name, time))
    },

    startView(options, startClocks = clocksNow()) {
      const callback = (startRumResult: StartRumResult) => {
        startRumResult.startView(options, startClocks)
      }
      bufferApiCalls.add(callback)

      if (!firstStartViewCall) {
        firstStartViewCall = { options, callback }
        tryStartRum()
      }
    },

    addAction(action, commonContext = getCommonContext()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addAction(action, commonContext))
    },

    addError(providedError, commonContext = getCommonContext()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addError(providedError, commonContext))
    },

    addFeatureFlagEvaluation(key, value) {
      bufferApiCalls.add((startRumResult) => startRumResult.addFeatureFlagEvaluation(key, value))
    },

    startDurationVital(vitalStart) {
      bufferApiCalls.add((startRumResult) => startRumResult.startDurationVital(vitalStart))
    },

    stopDurationVital(vitalStart) {
      bufferApiCalls.add((startRumResult) => startRumResult.stopDurationVital(vitalStart))
    },
  }
}

function overrideInitConfigurationForBridge(initConfiguration: RumInitConfiguration): RumInitConfiguration {
  return assign({}, initConfiguration, {
    applicationId: '00000000-aaaa-0000-aaaa-000000000000',
    clientToken: 'empty',
    sessionSampleRate: 100,
    defaultPrivacyLevel: initConfiguration.defaultPrivacyLevel ?? getEventBridge()?.getPrivacyLevel(),
  })
}
