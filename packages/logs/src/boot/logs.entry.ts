import {
  BoundedBuffer,
  combine,
  Context,
  createContextManager,
  defineGlobal,
  getGlobalObject,
  isPercentage,
  makePublicApi,
  monitor,
  display,
} from '@datadog/browser-core'
import { HandlerType, Logger, LogsMessage, StatusType } from '../domain/logger'
import { startLogs, LogsUserConfiguration } from './startLogs'

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType | HandlerType[]
  context?: object
}

export type LogsPublicApi = ReturnType<typeof makeLogsPublicApi>

export const datadogLogs = makeLogsPublicApi(startLogs)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LOGS', datadogLogs)

export type StartLogs = typeof startLogs

export function makeLogsPublicApi(startLogsImpl: StartLogs) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  const customLoggers: { [name: string]: Logger | undefined } = {}

  const beforeInitSendLog = new BoundedBuffer()
  let sendLogStrategy = (message: LogsMessage, currentContext: Context) => {
    beforeInitSendLog.add(() => sendLogStrategy(message, currentContext))
  }
  const logger = new Logger(sendLog)

  return makePublicApi({
    logger,

    init: monitor((userConfiguration: LogsUserConfiguration) => {
      if (!canInitLogs(userConfiguration)) {
        return
      }

      if (userConfiguration.publicApiKey) {
        userConfiguration.clientToken = userConfiguration.publicApiKey
        display.warn('Public API Key is deprecated. Please use Client Token instead.')
      }

      sendLogStrategy = startLogsImpl(userConfiguration, logger, globalContextManager.get)
      beforeInitSendLog.drain()

      isAlreadyInitialized = true
    }),

    getLoggerGlobalContext: monitor(globalContextManager.get),
    setLoggerGlobalContext: monitor(globalContextManager.set),

    addLoggerGlobalContext: monitor(globalContextManager.add),

    removeLoggerGlobalContext: monitor(globalContextManager.remove),

    createLogger: monitor((name: string, conf: LoggerConfiguration = {}) => {
      customLoggers[name] = new Logger(sendLog, conf.handler, conf.level, {
        ...conf.context,
        logger: { name },
      })
      return customLoggers[name]!
    }),

    getLogger: monitor((name: string) => customLoggers[name]),
  })

  function canInitLogs(userConfiguration: LogsUserConfiguration) {
    if (isAlreadyInitialized) {
      if (!userConfiguration.silentMultipleInit) {
        display.error('DD_LOGS is already initialized.')
      }
      return false
    }
    if (!userConfiguration || (!userConfiguration.publicApiKey && !userConfiguration.clientToken)) {
      display.error('Client Token is not configured, we will not send any data.')
      return false
    }
    if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
      display.error('Sample Rate should be a number between 0 and 100')
      return false
    }
    return true
  }

  function sendLog(message: LogsMessage) {
    sendLogStrategy(
      message,
      combine(
        {
          date: Date.now(),
          view: {
            referrer: document.referrer,
            url: window.location.href,
          },
        },
        globalContextManager.get()
      )
    )
  }
}
