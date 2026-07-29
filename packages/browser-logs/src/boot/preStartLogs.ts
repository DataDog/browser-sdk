import { timeStampNow } from '@datadog/js-core/time'
import type { TrackingConsentState, SessionManager } from '@datadog/browser-core'
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
  getRemoteConfigurationId,
} from '@datadog/browser-core'
import type { Hooks } from '../domain/hooks'
import { createHooks } from '../domain/hooks'
import type { LogsConfiguration, LogsInitConfiguration } from '../domain/configuration'
import { serializeLogsConfiguration, validateAndBuildLogsConfiguration } from '../domain/configuration'
import { fetchAndApplyLogsRemoteConfiguration, getLogsRemoteConfiguration } from '../domain/remoteConfiguration'
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
  doStartLogs: DoStartLogs,
  sdkName?: string
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

  function doInit(initConfig: LogsInitConfiguration) {
    const configuration = validateAndBuildLogsConfiguration(initConfig)
    if (!configuration) {
      return
    }
    addTelemetryConfiguration(serializeLogsConfiguration(initConfig))
    const startLogsResult = doStartLogs(configuration, sessionManager!, hooks)
    bufferApiCalls.subscribe((callback) => callback(startLogsResult))
    bufferApiCalls.unbuffer()
  }

  function tryStartLogs() {
    if (!cachedConfiguration || !cachedInitConfiguration || !sessionManager) {
      return
    }

    trackingConsentStateSubscription.unsubscribe()

    const hasRemoteConfiguration = getRemoteConfigurationId(cachedInitConfiguration)

    if (hasRemoteConfiguration) {
      const isSyncLoading =
        !!cachedInitConfiguration.remoteConfigurationId || !!cachedInitConfiguration.remoteConfiguration?.sync

      if (isSyncLoading) {
        void fetchAndApplyLogsRemoteConfiguration(cachedInitConfiguration)
          .then((resolvedInitConfig) => {
            if (resolvedInitConfig) {
              doInit(resolvedInitConfig)
            }
          })
          .catch(monitorError)
        return
      }

      const resolvedInitConfig = getLogsRemoteConfiguration(cachedInitConfiguration)
      if (!resolvedInitConfig) {
        return
      }
      doInit(resolvedInitConfig)
    } else {
      doInit(cachedInitConfiguration)
    }
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
        mockable(startTelemetry)(TelemetryService.LOGS, configuration, hooks.assembleTelemetry, sdkName)
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
