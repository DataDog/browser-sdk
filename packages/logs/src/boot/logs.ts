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
  Observable,
  RawError,
  startErrorCollection,
} from '@datadog/browser-core'
import { Logger, LogsMessage } from '../domain/logger'
import { LoggerSession, startLoggerSession } from '../domain/loggerSession'
import { buildEnv } from './buildEnv'
import { LogsUserConfiguration } from './logs.entry'

export function startLogs(
  userConfiguration: LogsUserConfiguration,
  errorLogger: Logger,
  getGlobalContext: () => Context
) {
  const { configuration, internalMonitoring } = commonInit(userConfiguration, buildEnv)
  const errorObservable =
    userConfiguration.forwardErrorsToLogs !== false ? startErrorCollection(configuration) : new Observable<RawError>()
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

  const batch = startLoggerBatch(configuration, session)

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
    if (session.isTracked()) {
      batch.add(message, currentContext)
    }
  }
}

function startLoggerBatch(configuration: Configuration, session: LoggerSession) {
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
    add(message: LogsMessage, currentContext: Context) {
      const contextualizedMessage = assembleMessageContexts(
        { service: configuration.service, session_id: session.getId() },
        currentContext,
        getRUMInternalContext(),
        message
      )
      primaryBatch.add(contextualizedMessage)
      if (replicaBatch) {
        replicaBatch.add(contextualizedMessage)
      }
    },
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
  const context = rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
  if (!context || !context.session) {
    return context
  }
  // TODO settle on integration strategy
  // tslint:disable:no-unsafe-any
  const v2context = context as any
  v2context.session_id = v2context.session.id
  v2context.application_id = v2context.application.id
  if (v2context.action) {
    v2context.user_action = { id: v2context.action.id }
  }
  // tslint:enable:no-unsafe-any
  return v2context as Context
}
