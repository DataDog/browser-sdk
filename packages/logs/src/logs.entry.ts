import {
  areCookiesAuthorized,
  Batch,
  checkIsNotLocalFile,
  combine,
  commonInit,
  Configuration,
  Context,
  ContextValue,
  createBufferedFunction,
  ErrorMessage,
  ErrorObservable,
  getGlobalObject,
  getTimestamp,
  HttpRequest,
  InternalMonitoring,
  isPercentage,
  makeGlobal,
  monitor,
  mustUseSecureCookie,
  UserConfiguration,
} from '@datadog/browser-core'
import { buildEnv } from './buildEnv'
import { HandlerType, Logger, LogsMessage, StatusType } from './logger'
import { LoggerSession, startLoggerSession } from './loggerSession'

export interface LogsUserConfiguration extends UserConfiguration {
  forwardErrorsToLogs?: boolean
}

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType
  context?: Context
}

export type Status = keyof typeof StatusType

export type LogsGlobal = ReturnType<typeof makeLogsGlobal>

export const datadogLogs = makeLogsGlobal((userConfiguration) => {
  const { configuration, errorObservable, internalMonitoring } = commonInit(userConfiguration, buildEnv)
  return {
    configuration,
    errorObservable,
    internalMonitoring,
    session: startLoggerSession(configuration, areCookiesAuthorized(mustUseSecureCookie(userConfiguration))),
  }
})

interface BrowserWindow extends Window {
  DD_LOGS?: LogsGlobal
}

getGlobalObject<BrowserWindow>().DD_LOGS = datadogLogs

export function makeLogsGlobal(
  baseInit: (
    configuration: LogsUserConfiguration
  ) => {
    session: LoggerSession
    configuration: Configuration
    errorObservable: ErrorObservable
    internalMonitoring: InternalMonitoring
  }
) {
  let isAlreadyInitialized = false

  let session: LoggerSession
  let batch: ReturnType<typeof startLoggerBatch>
  let configuration: Configuration

  let globalContext: Context = {}
  const customLoggers: { [name: string]: Logger | undefined } = {}

  const sendLogBuffered = createBufferedFunction((message: LogsMessage, currentContext: Context) => {
    if (session.isTracked()) {
      batch.add(message, currentContext)
    }
  })

  function sendLog(message: LogsMessage) {
    sendLogBuffered(
      message,
      combine(
        {
          date: Date.now(),
          view: {
            referrer: document.referrer,
            url: window.location.href,
          },
        },
        globalContext
      )
    )
  }

  const logger = new Logger(sendLog)

  return makeGlobal({
    logger,

    init: monitor((userConfiguration: LogsUserConfiguration) => {
      if (!checkIsNotLocalFile() || !canInitLogs(userConfiguration)) {
        return
      }

      if (userConfiguration.publicApiKey) {
        userConfiguration.clientToken = userConfiguration.publicApiKey
        console.warn('Public API Key is deprecated. Please use Client Token instead.')
      }
      const isCollectingError = userConfiguration.forwardErrorsToLogs !== false
      const logsUserConfiguration = {
        ...userConfiguration,
        isCollectingError,
      }
      const initResult = baseInit(logsUserConfiguration)
      session = initResult.session
      configuration = initResult.configuration

      initResult.internalMonitoring.setExternalContextProvider(() =>
        combine({ session_id: session.getId() }, globalContext, getRUMInternalContext())
      )

      batch = startLoggerBatch(configuration, session)

      initResult.errorObservable.subscribe((e: ErrorMessage) =>
        logger.error(
          e.message,
          combine({ date: getTimestamp(e.startTime), ...e.context }, getRUMInternalContext(e.startTime))
        )
      )

      sendLogBuffered.enable()

      isAlreadyInitialized = true
    }),

    setLoggerGlobalContext: (context: Context) => {
      globalContext = context
    },

    addLoggerGlobalContext: (key: string, value: ContextValue) => {
      globalContext[key] = value
    },

    removeLoggerGlobalContext: (key: string) => {
      delete globalContext[key]
    },

    createLogger: (name: string, conf: LoggerConfiguration = {}) => {
      customLoggers[name] = new Logger(sendLog, conf.handler, conf.level, {
        ...conf.context,
        logger: { name },
      })
      return customLoggers[name]!
    },

    getLogger: (name: string) => {
      return customLoggers[name]
    },
  })

  function canInitLogs(userConfiguration: LogsUserConfiguration) {
    if (isAlreadyInitialized) {
      if (!userConfiguration.silentMultipleInit) {
        console.error('DD_LOGS is already initialized.')
      }
      return false
    }
    if (!userConfiguration || (!userConfiguration.publicApiKey && !userConfiguration.clientToken)) {
      console.error('Client Token is not configured, we will not send any data.')
      return false
    }
    if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
      console.error('Sample Rate should be a number between 0 and 100')
      return false
    }
    return true
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
