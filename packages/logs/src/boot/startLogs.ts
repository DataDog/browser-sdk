import {
  areCookiesAuthorized,
  combine,
  commonInit,
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
  isEventBridgePresent,
  getEventBridge,
} from '@datadog/browser-core'
import { trackNetworkError } from '../domain/trackNetworkError'
import { Logger, LogsMessage, StatusType } from '../domain/logger'
import { LoggerSession, startLoggerSession, startStubLoggerSession } from '../domain/loggerSession'
import { LogsEvent } from '../logsEvent.types'
import { startLoggerBatch } from '../transport/startLoggerBatch'
import { buildEnv } from './buildEnv'

export interface LogsInitConfiguration extends InitConfiguration {
  forwardErrorsToLogs?: boolean | undefined
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
}

export function startLogs(initConfiguration: LogsInitConfiguration, errorLogger: Logger) {
  const { configuration, internalMonitoring } = commonInit(initConfiguration, buildEnv)
  const errorObservable = new Observable<RawError>()

  if (initConfiguration.forwardErrorsToLogs !== false) {
    trackConsoleError(errorObservable)
    trackRuntimeError(errorObservable)
    trackNetworkError(configuration, errorObservable)
  }

  const session = isEventBridgePresent()
    ? startStubLoggerSession()
    : startLoggerSession(configuration, areCookiesAuthorized(configuration.cookieOptions))

  return doStartLogs(configuration, errorObservable, internalMonitoring, session, errorLogger)
}

export function doStartLogs(
  configuration: Configuration,
  errorObservable: Observable<RawError>,
  internalMonitoring: InternalMonitoring,
  session: LoggerSession,
  errorLogger: Logger
) {
  internalMonitoring.setExternalContextProvider(() =>
    combine({ session_id: session.getId() }, getRUMInternalContext(), {
      view: { name: null, url: null, referrer: null },
    })
  )

  const assemble = buildAssemble(session, configuration, reportError)

  let onLogEventCollected: (message: Context) => void
  if (isEventBridgePresent()) {
    const bridge = getEventBridge()
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
          : undefined,
        getRUMInternalContext(error.startClocks.relative)
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
  session: LoggerSession,
  configuration: Configuration,
  reportError: (error: RawError) => void
) {
  const errorRateLimiter = createEventRateLimiter(StatusType.error, configuration.maxErrorsPerMinute, reportError)
  return (message: LogsMessage, currentContext: Context) => {
    if (!session.isTracked()) {
      return undefined
    }
    const contextualizedMessage = combine(
      { service: configuration.service, session_id: session.getId() },
      currentContext,
      getRUMInternalContext(),
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
