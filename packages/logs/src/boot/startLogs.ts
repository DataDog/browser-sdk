import {
  areCookiesAuthorized,
  combine,
  Configuration,
  Context,
  createEventRateLimiter,
  InternalMonitoring,
  Observable,
  RawError,
  RelativeTime,
  InitConfiguration,
  trackRuntimeError,
  trackConsoleError,
  canUseEventBridge,
  getEventBridge,
  getRelativeTime,
  updateExperimentalFeatures,
  buildConfiguration,
  startInternalMonitoring,
} from '@datadog/browser-core'
import { trackNetworkError } from '../domain/trackNetworkError'
import { Logger, LogsMessage, StatusType } from '../domain/logger'
import { LogsSessionManager, startLogsSessionManager, startLogsSessionManagerStub } from '../domain/logsSessionManager'
import { LogsEvent } from '../logsEvent.types'
import { startLoggerBatch } from '../transport/startLoggerBatch'
import { buildEnv } from './buildEnv'

export interface LogsInitConfiguration extends InitConfiguration {
  forwardErrorsToLogs?: boolean | undefined
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
}

export function startLogs(initConfiguration: LogsInitConfiguration, errorLogger: Logger) {
  updateExperimentalFeatures(initConfiguration.enableExperimentalFeatures)
  const configuration = buildConfiguration(initConfiguration, buildEnv)
  const internalMonitoring = startInternalMonitoring(configuration)

  const errorObservable = new Observable<RawError>()

  if (initConfiguration.forwardErrorsToLogs !== false) {
    trackConsoleError(errorObservable)
    trackRuntimeError(errorObservable)
    trackNetworkError(configuration, errorObservable)
  }

  const session =
    areCookiesAuthorized(configuration.cookieOptions) && !canUseEventBridge()
      ? startLogsSessionManager(configuration)
      : startLogsSessionManagerStub(configuration)

  return doStartLogs(configuration, errorObservable, internalMonitoring, session, errorLogger)
}

export function doStartLogs(
  configuration: Configuration,
  errorObservable: Observable<RawError>,
  internalMonitoring: InternalMonitoring,
  sessionManager: LogsSessionManager,
  errorLogger: Logger
) {
  internalMonitoring.setExternalContextProvider(() =>
    combine({ session_id: sessionManager.findTrackedSession()?.id }, getRUMInternalContext(), {
      view: { name: null, url: null, referrer: null },
    })
  )

  const assemble = buildAssemble(sessionManager, configuration, reportError)

  let onLogEventCollected: (message: Context) => void
  if (canUseEventBridge()) {
    const bridge = getEventBridge()!
    onLogEventCollected = (message) => bridge.send('log', message)
  } else {
    const batch = startLoggerBatch(configuration)
    onLogEventCollected = (message) => batch.add(message)
  }

  function reportError(error: RawError) {
    errorLogger.error(
      error.message,
      combine(
        {
          date: error.startClocks.timeStamp,
          error: {
            kind: error.type,
            origin: error.source,
            stack: error.stack,
          },
        },
        error.resource
          ? {
              http: {
                method: error.resource.method,
                status_code: error.resource.statusCode,
                url: error.resource.url,
              },
            }
          : undefined
      )
    )
  }
  errorObservable.subscribe(reportError)

  return (message: LogsMessage, currentContext: Context) => {
    const contextualizedMessage = assemble(message, currentContext)
    if (contextualizedMessage) {
      onLogEventCollected(contextualizedMessage)
    }
  }
}

export function buildAssemble(
  sessionManager: LogsSessionManager,
  configuration: Configuration,
  reportError: (error: RawError) => void
) {
  const errorRateLimiter = createEventRateLimiter(StatusType.error, configuration.maxErrorsPerMinute, reportError)
  return (message: LogsMessage, currentContext: Context) => {
    const startTime = message.date ? getRelativeTime(message.date) : undefined
    const session = sessionManager.findTrackedSession(startTime)
    if (!session) {
      return undefined
    }
    const contextualizedMessage = combine(
      { service: configuration.service, session_id: session.id },
      currentContext,
      getRUMInternalContext(startTime),
      message
    )
    if (configuration.beforeSend && configuration.beforeSend(contextualizedMessage) === false) {
      return undefined
    }
    if (contextualizedMessage.status === StatusType.error && errorRateLimiter.isLimitReached()) {
      return undefined
    }
    return contextualizedMessage as Context
  }
}

interface Rum {
  getInternalContext: (startTime?: RelativeTime) => Context
}

function getRUMInternalContext(startTime?: RelativeTime): Context | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
}
