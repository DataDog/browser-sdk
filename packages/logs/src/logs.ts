import {
  areCookiesAuthorized,
  Batch,
  combine,
  commonInit,
  Configuration,
  Context,
  ErrorMessage,
  getTimestamp,
  HttpRequest,
  mustUseSecureCookie,
} from '@datadog/browser-core'
import { buildEnv } from './buildEnv'
import { Logger, LogsMessage } from './logger'
import { LoggerSession, startLoggerSession } from './loggerSession'
import { LogsUserConfiguration } from './logs.entry'

export function startLogs(
  userConfiguration: LogsUserConfiguration,
  errorLogger: Logger,
  getGlobalContext: () => Context
) {
  const isCollectingError = userConfiguration.forwardErrorsToLogs !== false
  const logsUserConfiguration = {
    ...userConfiguration,
    isCollectingError,
  }
  const { configuration, internalMonitoring, errorObservable } = commonInit(logsUserConfiguration, buildEnv)
  const session = startLoggerSession(configuration, areCookiesAuthorized(mustUseSecureCookie(userConfiguration)))

  internalMonitoring.setExternalContextProvider(() =>
    combine({ session_id: session.getId() }, getGlobalContext(), getRUMInternalContext())
  )

  const batch = startLoggerBatch(configuration, session)

  errorObservable.subscribe((e: ErrorMessage) =>
    errorLogger.error(
      e.message,
      combine({ date: getTimestamp(e.startTime), ...e.context }, getRUMInternalContext(e.startTime))
    )
  )

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

  function withInternalContext(message: LogsMessage, currentContext: Context) {
    return combine(
      {
        service: configuration.service,
        session_id: session.getId(),
      },
      currentContext,
      getRUMInternalContext(),
      message
    )
  }

  return {
    add(message: LogsMessage, currentContext: Context) {
      const contextualizedMessage = withInternalContext(message, currentContext)
      primaryBatch.add(contextualizedMessage)
      if (replicaBatch) {
        replicaBatch.add(contextualizedMessage)
      }
    },
  }
}

interface Rum {
  getInternalContext: (startTime?: number) => Context
}

function getRUMInternalContext(startTime?: number): Context | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
}
