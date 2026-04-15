import type {
  TrackingConsentState,
  DeflateWorker,
  Context,
  Telemetry,
  TimeStamp,
  SessionManager,
} from '@datadog/browser-core'
import {
  BufferedObservable,
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
  CustomerContextKey,
  buildAccountContextManager,
  buildGlobalContextManager,
  buildUserContextManager,
  bufferContextCalls,
  monitorError,
  sanitize,
  startSessionManager,
  startSessionManagerStub,
  startTelemetry,
  TelemetryService,
  mockable,
  isWorkerEnvironment,
  startTelemetrySessionContext,
  addTelemetryDebug,
} from '@datadog/browser-core'
import type { Hooks } from '../domain/hooks'
import { createHooks } from '../domain/hooks'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import {
  validateAndBuildRumConfiguration,
  fetchAndApplyRemoteConfiguration,
  serializeRumConfiguration,
} from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import type { FeatureOperationOptions, FailureReason } from '../domain/vital/vitalCollection'
import { callPluginsMethod } from '../domain/plugins'
import { startTrackingConsentContext } from '../domain/contexts/trackingConsentContext'
import type { StartRumResult } from './startRum'
import type { RumPublicApiOptions, Strategy } from './rumPublicApi'

export type DoStartRum = (
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  deflateWorker: DeflateWorker | undefined,
  initialViewOptions: ViewOptions | undefined,
  telemetry: Telemetry,
  hooks: Hooks
) => StartRumResult

export function createPreStartStrategy(
  { ignoreInitIfSyntheticsWillInjectRum = true, startDeflateWorker }: RumPublicApiOptions,
  trackingConsentState: TrackingConsentState,
  doStartRum: DoStartRum
): Strategy {
  const BUFFER_LIMIT = 500
  const bufferApiCalls = new BufferedObservable<(startRumResult: StartRumResult) => void>(BUFFER_LIMIT, (count) => {
    // monitor-until: 2026-10-14
    addTelemetryDebug('preStartRum buffer data lost', { count })
  })

  // TODO next major: remove the globalContextManager, userContextManager and accountContextManager from preStartStrategy and use an empty context instead
  const globalContext = buildGlobalContextManager()
  bufferContextCalls(globalContext, CustomerContextKey.globalContext, bufferApiCalls)

  const userContext = buildUserContextManager()
  bufferContextCalls(userContext, CustomerContextKey.userContext, bufferApiCalls)

  const accountContext = buildAccountContextManager()
  bufferContextCalls(accountContext, CustomerContextKey.accountContext, bufferApiCalls)

  let firstStartViewCall:
    | { options: ViewOptions | undefined; callback: (startRumResult: StartRumResult) => void }
    | undefined
  let deflateWorker: DeflateWorker | undefined

  let cachedInitConfiguration: RumInitConfiguration | undefined
  let cachedConfiguration: RumConfiguration | undefined
  let sessionManager: SessionManager | undefined
  let telemetry: Telemetry | undefined
  const hooks = createHooks()

  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartRum)

  const emptyContext: Context = {}

  function tryStartRum() {
    if (!cachedInitConfiguration || !cachedConfiguration || !sessionManager || !telemetry) {
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
      // initial view options, and we skip the actual startView callback so we don't create an extra
      // view.
      initialViewOptions = firstStartViewCall.options
    }

    const callbackToSkip = cachedConfiguration.trackViewsManually ? firstStartViewCall?.callback : undefined

    const startRumResult = doStartRum(
      cachedConfiguration,
      sessionManager,
      deflateWorker,
      initialViewOptions,
      telemetry,
      hooks
    )

    bufferApiCalls.subscribe((callback) => {
      if (callback !== callbackToSkip) {
        callback(startRumResult)
      }
    })
    bufferApiCalls.unbuffer()
  }

  function doInit(initConfiguration: RumInitConfiguration, errorStack?: string) {
    const eventBridgeAvailable = canUseEventBridge()
    if (eventBridgeAvailable) {
      initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
    }

    // Update the exposed initConfiguration to reflect the bridge and remote configuration overrides
    cachedInitConfiguration = initConfiguration

    if (cachedConfiguration) {
      displayAlreadyInitializedError('DD_RUM', initConfiguration)
      return
    }

    const configuration = validateAndBuildRumConfiguration(initConfiguration, errorStack)
    if (!configuration) {
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

    trackingConsentState.onGrantedOnce(() => {
      startTrackingConsentContext(hooks, trackingConsentState)
      telemetry = mockable(startTelemetry)(TelemetryService.RUM, configuration, hooks)

      if (isWorkerEnvironment) {
        display.warn('The RUM SDK is not supported in a web or service worker environment.')
        return
      }

      const sessionManagerPromise = canUseEventBridge()
        ? startSessionManagerStub()
        : mockable(startSessionManager)(configuration, trackingConsentState)

      void sessionManagerPromise
        .then((newSessionManager) => {
          if (!newSessionManager) {
            return
          }
          sessionManager = newSessionManager
          startTelemetrySessionContext(hooks, sessionManager, { application: { id: configuration.applicationId } })
          addTelemetryConfiguration(serializeRumConfiguration(initConfiguration))

          tryStartRum()
        })
        .catch(monitorError)
    })
  }

  const addOperationStepVital = (
    name: string,
    stepType: 'start' | 'end',
    options?: FeatureOperationOptions,
    failureReason?: FailureReason
  ) => {
    bufferApiCalls.notify((startRumResult) =>
      startRumResult.addOperationStepVital(
        sanitize(name)!,
        stepType,
        sanitize(options) as FeatureOperationOptions,
        sanitize(failureReason) as FailureReason | undefined
      )
    )
  }

  const strategy: Strategy = {
    init(initConfiguration, publicApi, errorStack) {
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
        fetchAndApplyRemoteConfiguration(initConfiguration, { user: userContext, context: globalContext })
          .then((initConfiguration) => {
            if (initConfiguration) {
              doInit(initConfiguration, errorStack)
            }
          })
          .catch(monitorError)
      } else {
        doInit(initConfiguration, errorStack)
      }
    },

    get initConfiguration() {
      return cachedInitConfiguration
    },

    getInternalContext: noop as () => undefined,

    stopSession: noop,

    addTiming(name, time = timeStampNow()) {
      bufferApiCalls.notify((startRumResult) => startRumResult.addTiming(name, time))
    },

    setLoadingTime: ((callTimestamp: TimeStamp) => {
      bufferApiCalls.notify((startRumResult) => startRumResult.setLoadingTime(callTimestamp))
    }) as Strategy['setLoadingTime'],

    startView(options, startClocks = clocksNow()) {
      const callback = (startRumResult: StartRumResult) => {
        startRumResult.startView(options, startClocks)
      }
      bufferApiCalls.notify(callback)

      if (!firstStartViewCall) {
        firstStartViewCall = { options, callback }
        tryStartRum()
      }
    },

    setViewName(name) {
      bufferApiCalls.notify((startRumResult) => startRumResult.setViewName(name))
    },

    // View context APIs

    setViewContext(context) {
      bufferApiCalls.notify((startRumResult) => startRumResult.setViewContext(context))
    },

    setViewContextProperty(key, value) {
      bufferApiCalls.notify((startRumResult) => startRumResult.setViewContextProperty(key, value))
    },

    getViewContext: () => emptyContext,

    globalContext,
    userContext,
    accountContext,

    addAction(action) {
      bufferApiCalls.notify((startRumResult) => startRumResult.addAction(action))
    },

    startAction(name, options) {
      const startClocks = clocksNow()
      bufferApiCalls.notify((startRumResult) => startRumResult.startAction(name, options, startClocks))
    },

    stopAction(name, options) {
      const stopClocks = clocksNow()
      bufferApiCalls.notify((startRumResult) => startRumResult.stopAction(name, options, stopClocks))
    },

    startResource(url, options) {
      const startClocks = clocksNow()
      bufferApiCalls.notify((startRumResult) => startRumResult.startResource(url, options, startClocks))
    },

    stopResource(url, options) {
      const stopClocks = clocksNow()
      bufferApiCalls.notify((startRumResult) => startRumResult.stopResource(url, options, stopClocks))
    },

    addError(providedError) {
      bufferApiCalls.notify((startRumResult) => startRumResult.addError(providedError))
    },

    addFeatureFlagEvaluation(key, value) {
      bufferApiCalls.notify((startRumResult) => startRumResult.addFeatureFlagEvaluation(key, value))
    },

    startDurationVital(name, options) {
      const startClocks = clocksNow()
      bufferApiCalls.notify((startRumResult) => startRumResult.startDurationVital(name, options, startClocks))
    },

    stopDurationVital(name, options) {
      const stopClocks = clocksNow()
      bufferApiCalls.notify((startRumResult) => startRumResult.stopDurationVital(name, options, stopClocks))
    },

    addDurationVital(vital) {
      bufferApiCalls.notify((startRumResult) => startRumResult.addDurationVital(vital))
    },
    addOperationStepVital,
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
