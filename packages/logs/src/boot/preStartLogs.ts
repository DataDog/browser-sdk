import type { TrackingConsentState, BufferedObservable, TelemetryEvent, Context, RawError } from '@datadog/browser-core'
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
  addTelemetryConfiguration,
  buildGlobalContextManager,
  buildUserContextManager,
  BufferedObservable as BufferedObservableClass,
  startTelemetryCollection,
  TelemetryService,
  addTelemetryDebug,
  addTelemetryError,
} from '@datadog/browser-core'
import { createHooks } from '../domain/hooks'
import type { Hooks } from '../domain/hooks'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { serializeLogsConfiguration, validateAndBuildLogsConfiguration } from '../domain/configuration'
import type { CommonContext } from '../rawLogsEvent.types'
import type { Strategy } from './logsPublicApi'
import type { StartLogsResult } from './startLogs'

// ============================================================================
// PRE-START STATE (Phase 4)
// ============================================================================
let cachedHooks: Hooks | undefined
let preStartLogsObservable: BufferedObservable<TelemetryEvent & Context> | undefined
let preStartErrorBuffer: RawError[] = []

export function createPreStartStrategy(
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState,
  doStartLogs: (initConfiguration: LogsInitConfiguration, configuration: LogsConfiguration) => StartLogsResult
): Strategy {
  const bufferApiCalls = createBoundedBuffer<StartLogsResult>()

  // TODO next major: remove the globalContext, accountContextManager, userContext from preStartStrategy and use an empty context instead
  const globalContext = buildGlobalContextManager()
  bufferContextCalls(globalContext, CustomerContextKey.globalContext, bufferApiCalls)

  const accountContext = buildAccountContextManager()
  bufferContextCalls(accountContext, CustomerContextKey.accountContext, bufferApiCalls)

  const userContext = buildUserContextManager()
  bufferContextCalls(userContext, CustomerContextKey.userContext, bufferApiCalls)

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
    init(initConfiguration, errorStack) {
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
      addTelemetryConfiguration(serializeLogsConfiguration(initConfiguration))

      if (cachedConfiguration) {
        displayAlreadyInitializedError('DD_LOGS', initConfiguration)
        return
      }

      const configuration = validateAndBuildLogsConfiguration(initConfiguration, errorStack)
      if (!configuration) {
        return
      }

      // Phase 4: Create Hooks early for telemetry collection
      const hooks = createHooks()
      cachedHooks = hooks

      // Phase 4: Start telemetry collection before other initialization
      // This captures any errors during preStart (config validation, etc.)
      // Transport attaches later in startLogs (Plan 03) when dependencies ready
      const { enabled: telemetryEnabled } = startTelemetryCollection(
        TelemetryService.LOGS,
        configuration,
        hooks,
        getPreStartLogsObservable()
      )

      if (!telemetryEnabled) {
        // Optional: log debug info, but don't block
        addTelemetryDebug('Telemetry disabled for this site')
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
    userContext,

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

export function getPreStartHooks(): Hooks | undefined {
  return cachedHooks
}

// ============================================================================
// PRE-START TELEMETRY OBSERVABLE (Phase 4)
// ============================================================================
// Provides the telemetry observable created during preStart for use by startLogs.
// This is a lazy singleton - created once when first accessed.
// It is a BufferedObservable(100) to capture all events emitted between Phase 4
// collection start and Phase 5 transport subscription.
//
// Flow:
// 1. preStartLogs calls startTelemetryCollection() with getPreStartLogsObservable()
// 2. Collection subscribes to the BufferedObservable, triggering auto-replay via queueMicrotask
// 3. Events emitted during preStart are buffered (up to 100 events)
// 4. startLogs retrieves same observable and passes to startTelemetryTransport
// 5. Transport subscribes to parameter observable, triggering replay of buffered events
// 6. Transport calls unbuffer() to clear buffer and prevent future buffering (memory optimization)
//
// The observable continues to work after unbuffer - future events flow through
// without buffering (memory optimization for long-running sessions).
// ============================================================================
export function getPreStartLogsObservable(): BufferedObservable<TelemetryEvent & Context> {
  if (!preStartLogsObservable) {
    preStartLogsObservable = new BufferedObservableClass(100)
  }
  return preStartLogsObservable
}

export function clearPreStartLogsObservable() {
  preStartLogsObservable = undefined
}

// ============================================================================
// PRE-START ERROR BUFFERING (Phase 4)
// ============================================================================
export function createPreStartLogsReportError() {
  return (error: RawError) => {
    // Emit immediately to telemetry observable
    addTelemetryError(error.message || 'Unknown error')
    // Buffer for later replay through full LifeCycle in startLogs
    preStartErrorBuffer.push(error)
  }
}

export function getPreStartErrorBuffer(): RawError[] {
  return preStartErrorBuffer
}

export function clearPreStartErrorBuffer() {
  preStartErrorBuffer = []
}
