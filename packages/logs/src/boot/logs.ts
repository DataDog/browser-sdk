import {
  areCookiesAuthorized,
  Batch,
  combine,
  commonInit,
  Configuration,
  Context,
  ErrorObservable,
  getTimestamp,
  HttpRequest,
  InternalMonitoring,
  limitModification,
  Observable,
  RawError,
  startAutomaticErrorCollection,
} from '@datadog/browser-core'
import { Logger, LogsMessage } from '../domain/logger'
import { LoggerSession, startLoggerSession } from '../domain/loggerSession'
import { LogsEvent } from '../logsEvent.types'
import { buildEnv } from './buildEnv'
import { LogsUserConfiguration } from './logs.entry'

const FIELDS_WITH_SENSITIVE_DATA = ['view.url', 'view.referrer', 'message', 'error.stack', 'http.url']

export function startLogs(
  userConfiguration: LogsUserConfiguration,
  errorLogger: Logger,
  getGlobalContext: () => Context
) {
  const { configuration, internalMonitoring } = commonInit(userConfiguration, buildEnv)
  const errorObservable =
    userConfiguration.forwardErrorsToLogs !== false
      ? startAutomaticErrorCollection(configuration)
      : new Observable<RawError>()
  const session = startLoggerSession(configuration, areCookiesAuthorized(configuration.cookieOptions))
  return doStartLogs(configuration, errorObservable, internalMonitoring, session, errorLogger, getGlobalContext)
}

export function doStartLogs(
  configuration: Configuration,
  errorObservable: ErrorObservable,
  internalMonitoring: InternalMonitoring,
  session: LoggerSession,
  errorLogger: Logger,
  getGlobalContext: () => Context
) {
  internalMonitoring.setExternalContextProvider(() =>
    combine({ session_id: session.getId() }, getGlobalContext(), getRUMInternalContext())
  )

  const assemble = buildAssemble(session, configuration)
  const batch = startLoggerBatch(configuration)

  errorObservable.subscribe((error: RawError) => {
    errorLogger.error(
      error.message,
      combine(
        {
          date: getTimestamp(error.startTime),
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
        getRUMInternalContext(error.startTime)
      )
    )
  })

  return (message: LogsMessage, currentContext: Context) => {
    const contextualizedMessage = assemble(message, currentContext)
    if (contextualizedMessage) {
      batch.add(contextualizedMessage)
    }
  }
}

function startLoggerBatch(configuration: Configuration) {
  const primaryBatch = createLoggerBatch(configuration.logsEndpoint)

  let replicaBatch: Batch | undefined
  if (configuration.replica !== undefined) {
    replicaBatch = createLoggerBatch(configuration.replica.logsEndpoint)
  }

  function createLoggerBatch(endpointUrl: string) {
    return new Batch(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout
    )
  }

  return {
    add(message: Context) {
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(message)
      }
    },
  }
}

export function buildAssemble(session: LoggerSession, configuration: Configuration) {
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
    if (configuration.beforeSend) {
      limitModification(
        contextualizedMessage as LogsEvent & Context,
        FIELDS_WITH_SENSITIVE_DATA,
        configuration.beforeSend
      )
    }
    return contextualizedMessage as Context
  }
}

export function assembleMessageContexts(
  defaultContext: { service?: string; session_id?: string },
  currentContext: Context,
  rumInternalContext: Context | undefined,
  message: LogsMessage
) {
  return combine(defaultContext, currentContext, rumInternalContext, message)
}

interface Rum {
  getInternalContext: (startTime?: number) => Context
}

function getRUMInternalContext(startTime?: number): Context | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
}
