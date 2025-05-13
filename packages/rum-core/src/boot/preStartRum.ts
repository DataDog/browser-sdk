import {
  createBoundedBuffer,
  display,
  canUseEventBridge,
  displayAlreadyInitializedError,
  willSyntheticsInjectRum,
  noop,
  timeStampNow,
  clocksNow,
  getEventBridge,
  initFeatureFlags,
  addTelemetryConfiguration,
  initFetchObservable,
} from '@flashcatcloud/browser-core'
import type { TrackingConsentState, DeflateWorker, Context } from '@flashcatcloud/browser-core'
import {
  validateAndBuildRumConfiguration,
  type RumConfiguration,
  type RumInitConfiguration,
} from '../domain/configuration'
import type { CommonContext } from '../domain/contexts/commonContext'
import type { ViewOptions } from '../domain/view/trackViews'
import type { DurationVital, CustomVitalsState } from '../domain/vital/vitalCollection'
import { startDurationVital, stopDurationVital } from '../domain/vital/vitalCollection'
import { fetchAndApplyRemoteConfiguration, serializeRumConfiguration } from '../domain/configuration'
import { callPluginsMethod } from '../domain/plugins'
import type { RumPublicApiOptions, Strategy } from './rumPublicApi'
import type { StartRumResult } from './startRum'

export function createPreStartStrategy(
  { ignoreInitIfSyntheticsWillInjectRum, startDeflateWorker }: RumPublicApiOptions,
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState,
  customVitalsState: CustomVitalsState,
  doStartRum: (
    configuration: RumConfiguration,
    deflateWorker: DeflateWorker | undefined,
    initialViewOptions?: ViewOptions
  ) => StartRumResult
): Strategy {
  const bufferApiCalls = createBoundedBuffer<StartRumResult>()

  let firstStartViewCall:
    | { options: ViewOptions | undefined; callback: (startRumResult: StartRumResult) => void }
    | undefined
  let deflateWorker: DeflateWorker | undefined

  let cachedInitConfiguration: RumInitConfiguration | undefined
  let cachedConfiguration: RumConfiguration | undefined

  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartRum)

  const emptyContext: Context = {}

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
      displayAlreadyInitializedError('FC_RUM', initConfiguration)
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
    // Instrumuent fetch to track network requests
    // This is needed in case the consent is not granted and some cutsomer
    // library (Apollo Client) is storing uninstrumented fetch to be used later
    // The subscrption is needed so that the instrumentation process is completed
    initFetchObservable().subscribe(noop)

    trackingConsentState.tryToInit(configuration.trackingConsent)
    tryStartRum()
  }

  const addDurationVital = (vital: DurationVital) => {
    bufferApiCalls.add((startRumResult) => startRumResult.addDurationVital(vital))
  }

  const strategy: Strategy = {
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

      callPluginsMethod(initConfiguration.plugins, 'onInit', { initConfiguration, publicApi })

      if (initConfiguration.remoteConfigurationId) {
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

    setViewName(name) {
      bufferApiCalls.add((startRumResult) => startRumResult.setViewName(name))
    },

    setViewContext(context) {
      bufferApiCalls.add((startRumResult) => startRumResult.setViewContext(context))
    },

    setViewContextProperty(key, value) {
      bufferApiCalls.add((startRumResult) => startRumResult.setViewContextProperty(key, value))
    },

    getViewContext: () => emptyContext,

    addAction(action, commonContext = getCommonContext()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addAction(action, commonContext))
    },

    addError(providedError, commonContext = getCommonContext()) {
      bufferApiCalls.add((startRumResult) => startRumResult.addError(providedError, commonContext))
    },

    addFeatureFlagEvaluation(key, value) {
      bufferApiCalls.add((startRumResult) => startRumResult.addFeatureFlagEvaluation(key, value))
    },

    startDurationVital(name, options) {
      return startDurationVital(customVitalsState, name, options)
    },

    stopDurationVital(name, options) {
      stopDurationVital(addDurationVital, customVitalsState, name, options)
    },

    addDurationVital,
  }

  return strategy
}

function overrideInitConfigurationForBridge(initConfiguration: RumInitConfiguration): RumInitConfiguration {
  return {
    ...initConfiguration,
    applicationId: '00000000-aaaa-0000-aaaa-000000000000',
    clientToken: 'empty',
    sessionSampleRate: 100,
    defaultPrivacyLevel: initConfiguration.defaultPrivacyLevel ?? getEventBridge()?.getPrivacyLevel(),
  }
}
