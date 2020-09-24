import {
  areCookiesAuthorized,
  Batch,
  checkIsNotLocalFile,
  commonInit,
  Configuration,
  Context,
  ContextValue,
  deepMerge,
  ErrorMessage,
  ErrorObservable,
  getGlobalObject,
  getTimestamp,
  HttpRequest,
  InternalMonitoring,
  isPercentage,
  makeGlobal,
  monitor,
  noop,
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
    session: startLoggerSession(configuration, areCookiesAuthorized(configuration.cookieOptions.secure)),
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

  function sendLog(message: LogsMessage) {
    if (!batch || !session) {
      throw new Error('unimplemented')
    }
    if (session.isTracked()) {
      batch.add(message)
    }
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

      initResult.internalMonitoring.setExternalContextProvider(
        () => deepMerge({ session_id: session.getId() }, globalContext, getRUMInternalContext() as Context) as Context
      )

      batch = startLoggerBatch(configuration, session, () => globalContext)

      initResult.errorObservable.subscribe((e: ErrorMessage) =>
        logger.error(
          e.message,
          deepMerge(
            ({ date: getTimestamp(e.startTime), ...e.context } as unknown) as Context,
            getRUMInternalContext(e.startTime)
          )
        )
      )

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

function startLoggerBatch(configuration: Configuration, session: LoggerSession, globalContextProvider: () => Context) {
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

  function withContext(message: LogsMessage) {
    return deepMerge(
      {
        date: new Date().getTime(),
        service: configuration.service,
        session_id: session.getId(),
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      },
      globalContextProvider(),
      getRUMInternalContext() as Context,
      message
    ) as Context
  }

  return {
    add(message: LogsMessage) {
      const contextualizedMessage = withContext(message)
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
