import { timeStampNow } from '@datadog/js-core/time'
import type { TrackingConsentState, SessionManager, RemoteConfiguration } from '@datadog/browser-core'
import {
  BufferedObservable,
  canUseEventBridge,
  display,
  displayAlreadyInitializedError,
  initFeatureFlags,
  monitorError,
  noop,
  buildAccountContextManager,
  CustomerContextKey,
  bufferContextCalls,
  addTelemetryConfiguration,
  addTelemetryDebug,
  buildGlobalContextManager,
  buildUserContextManager,
  startSessionManager,
  startSessionManagerStub,
  startTelemetry,
  TelemetryService,
  mockable,
  startTelemetrySessionContext,
  setAllowUntrustedEvents,
  createConfigurationCache,
  fetchRemoteConfiguration,
  getRemoteConfigurationId,
} from '@datadog/browser-core'
import type { Hooks } from '../domain/hooks'
import { createHooks } from '../domain/hooks'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { serializeLogsConfiguration, validateAndBuildLogsConfiguration } from '../domain/configuration'
import { applyLogsRemoteConfiguration } from '../domain/remoteConfiguration'
import type { CommonContext } from '../rawLogsEvent.types'
import { startTrackingConsentContext } from '../domain/contexts/trackingConsentContext'
import type { Strategy } from './logsPublicApi'
import type { StartLogsResult } from './startLogs'

export type DoStartLogs = (
  configuration: LogsConfiguration,
  sessionManager: SessionManager,
  hooks: Hooks
) => StartLogsResult

export function createPreStartStrategy(
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState,
  doStartLogs: DoStartLogs
): Strategy {
  const BUFFER_LIMIT = 500
  const bufferApiCalls = new BufferedObservable<(startLogsResult: StartLogsResult) => void>(BUFFER_LIMIT, (count) => {
    // monitor-until: 2026-10-14
    addTelemetryDebug('preStartLogs buffer data lost', { count })
  })

  // TODO next major: remove the globalContext, accountContextManager, userContext from preStartStrategy and use an empty context instead
  const globalContext = buildGlobalContextManager()
  bufferContextCalls(globalContext, CustomerContextKey.globalContext, bufferApiCalls)

  const accountContext = buildAccountContextManager()
  bufferContextCalls(accountContext, CustomerContextKey.accountContext, bufferApiCalls)

  const userContext = buildUserContextManager()
  bufferContextCalls(userContext, CustomerContextKey.userContext, bufferApiCalls)

  let cachedInitConfiguration: LogsInitConfiguration | undefined
  let cachedConfiguration: LogsConfiguration | undefined
  let sessionManager: SessionManager | undefined
  const hooks = createHooks()
  const trackingConsentStateSubscription = trackingConsentState.observable.subscribe(tryStartLogs)

  function tryStartLogs() {
    if (!cachedConfiguration || !cachedInitConfiguration || !sessionManager) {
      return
    }

    trackingConsentStateSubscription.unsubscribe()

    const remoteConfigId = getRemoteConfigurationId(cachedInitConfiguration)
    let configurationToUse = cachedConfiguration

    if (remoteConfigId) {
      const cache = createConfigurationCache<RemoteConfiguration>({ remoteConfigurationId: remoteConfigId })
      const cacheResult = cache.read()
      const fetchPromise = fetchRemoteConfiguration(cachedInitConfiguration)

      if (cacheResult.status === 'hit') {
        const resolvedInitConfig = applyLogsRemoteConfiguration(cachedInitConfiguration, cacheResult.config)
        const resolvedLogsConfig = validateAndBuildLogsConfiguration(resolvedInitConfig)
        if (resolvedLogsConfig) {
          configurationToUse = resolvedLogsConfig
        }
        // Background sync — update the cache for the next page load
        fetchPromise
          .then((fetchResult) => {
            if (fetchResult.ok) {
              cache.write(fetchResult.value)
            }
          })
          .catch(monitorError)
      } else if (cachedInitConfiguration.remoteConfiguration?.required) {
        fetchPromise
          .then((fetchResult) => {
            if (fetchResult.ok) {
              cache.write(fetchResult.value)
            }
            const resolvedInitConfig = fetchResult.ok
              ? applyLogsRemoteConfiguration(cachedInitConfiguration!, fetchResult.value)
              : cachedInitConfiguration!
            const resolvedLogsConfig = validateAndBuildLogsConfiguration(resolvedInitConfig)
            if (resolvedLogsConfig) {
              const startLogsResult = doStartLogs(resolvedLogsConfig, sessionManager!, hooks)
              bufferApiCalls.subscribe((callback) => callback(startLogsResult))
              bufferApiCalls.unbuffer()
            }
          })
          .catch(monitorError)
        return
      } else {
        // Cache miss, not required — still refresh the cache for next load
        fetchPromise
          .then((fetchResult) => {
            if (fetchResult.ok) {
              cache.write(fetchResult.value)
            }
          })
          .catch(monitorError)
      }
    }

    const startLogsResult = doStartLogs(configurationToUse, sessionManager, hooks)

    bufferApiCalls.subscribe((callback) => callback(startLogsResult))
    bufferApiCalls.unbuffer()
  }

  return {
    init(initConfiguration, errorStack) {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }
      // Set the experimental feature flags as early as possible, so we can use them in most places
      initFeatureFlags(initConfiguration.enableExperimentalFeatures)
      setAllowUntrustedEvents(initConfiguration.allowUntrustedEvents)

      if (canUseEventBridge()) {
        initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
      }

      // Expose the initial configuration regardless of initialization success.
      cachedInitConfiguration = initConfiguration

      if (cachedConfiguration) {
        displayAlreadyInitializedError('DD_LOGS', initConfiguration)
        return
      }

      const configuration = validateAndBuildLogsConfiguration(initConfiguration, errorStack)
      if (!configuration) {
        return
      }

      cachedConfiguration = configuration

      trackingConsentState.tryToInit(configuration.trackingConsent)

      trackingConsentState.onGrantedOnce(() => {
        startTrackingConsentContext(hooks, trackingConsentState)
        mockable(startTelemetry)(TelemetryService.LOGS, configuration, hooks.assembleTelemetry)
        const sessionManagerPromise = canUseEventBridge()
          ? startSessionManagerStub()
          : mockable(startSessionManager)(configuration, trackingConsentState)

        void sessionManagerPromise
          .then((newSessionManager) => {
            if (!newSessionManager) {
              return
            }
            sessionManager = newSessionManager
            startTelemetrySessionContext(hooks.assembleTelemetry, sessionManager)
            addTelemetryConfiguration(serializeLogsConfiguration(initConfiguration))
            tryStartLogs()
          })
          .catch(monitorError)
      })
    },

    get initConfiguration() {
      return cachedInitConfiguration
    },

    globalContext,
    accountContext,
    userContext,

    getInternalContext: noop as () => undefined,

    handleLog(message, statusType, handlingStack, context = getCommonContext(), date = timeStampNow()) {
      bufferApiCalls.notify((startLogsResult) =>
        startLogsResult.handleLog(message, statusType, handlingStack, context, date)
      )
    },
  }
}

function overrideInitConfigurationForBridge(initConfiguration: LogsInitConfiguration): LogsInitConfiguration {
  return { ...initConfiguration, clientToken: 'empty' }
}
