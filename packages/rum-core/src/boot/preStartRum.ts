import {
  BoundedBuffer,
  display,
  type DeflateWorker,
  canUseEventBridge,
  displayAlreadyInitializedError,
  willSyntheticsInjectRum,
  noop,
  timeStampNow,
  clocksNow,
  assign,
} from '@datadog/browser-core'
import {
  validateAndBuildRumConfiguration,
  type RumConfiguration,
  type RumInitConfiguration,
} from '../domain/configuration'
import type { CommonContext } from '../domain/contexts/commonContext'
import type { ViewOptions } from '../domain/view/trackViews'
import type { RumPublicApiOptions, Strategy } from './rumPublicApi'
import type { StartRumResult } from './startRum'

export function createPreStartStrategy(
  { ignoreInitIfSyntheticsWillInjectRum, startDeflateWorker }: RumPublicApiOptions,
  getCommonContext: () => CommonContext,
  doStartRum: (
    initConfiguration: RumInitConfiguration,
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

  function tryStartRum() {
    if (!cachedInitConfiguration || !cachedConfiguration) {
      return
    }

    let initialViewOptions: ViewOptions | undefined

    if (cachedConfiguration.trackViewsManually) {
      if (!firstStartViewCall) {
        return
      }
      // An initial view is always created when starting RUM.
      // When tracking views automatically, any startView call before RUM start creates an extra
      // view.
      // When tracking views manually, we use the ViewOptions from the first startView call as the
      // initial view options, and we remove the actual startView call so we don't create
      bufferApiCalls.remove(firstStartViewCall.callback)
      initialViewOptions = firstStartViewCall.options
    }

    const startRumResult = doStartRum(cachedInitConfiguration, cachedConfiguration, deflateWorker, initialViewOptions)

    bufferApiCalls.drain(startRumResult)
  }

  return {
    init(initConfiguration) {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }

      const eventBridgeAvailable = canUseEventBridge()
      if (eventBridgeAvailable) {
        initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
      }

      // Expose the initial configuration regardless of initialization success.
      cachedInitConfiguration = initConfiguration

      if (cachedConfiguration) {
        displayAlreadyInitializedError('DD_RUM', initConfiguration)
        return
      }

      // If we are in a Synthetics test configured to automatically inject a RUM instance, we want to
      // completely discard the customer application RUM instance by ignoring their init() call.  But,
      // we should not ignore the init() call from the Synthetics-injected RUM instance, so the
      // internal `ignoreInitIfSyntheticsWillInjectRum` option is here to bypass this condition.
      if (ignoreInitIfSyntheticsWillInjectRum && willSyntheticsInjectRum()) {
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
      tryStartRum()
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
  }
}

function overrideInitConfigurationForBridge(initConfiguration: RumInitConfiguration): RumInitConfiguration {
  return assign({}, initConfiguration, {
    applicationId: '00000000-aaaa-0000-aaaa-000000000000',
    clientToken: 'empty',
    sessionSampleRate: 100,
  })
}
