import {
  BoundedBuffer,
  combine,
  Context,
  createContextManager,
  makePublicApi,
  monitor,
  display,
  deepClone,
  InitConfiguration,
  canUseEventBridge,
} from '@datadog/browser-core'
import { LogsInitConfiguration, validateAndBuildLogsConfiguration } from '../domain/configuration'
import { HandlerType, Logger, LogsMessage, StatusType } from '../domain/logger'
import { startLogs } from './startLogs'

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType | HandlerType[]
  context?: object
}

export type LogsPublicApi = ReturnType<typeof makeLogsPublicApi>

export type StartLogs = typeof startLogs

export function makeLogsPublicApi(startLogsImpl: StartLogs) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  const customLoggers: { [name: string]: Logger | undefined } = {}

  const beforeInitSendLog = new BoundedBuffer()
  let sendLogStrategy = (message: LogsMessage, currentContext: Context) => {
    beforeInitSendLog.add(() => sendLogStrategy(message, currentContext))
  }
  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined
  const logger = new Logger(sendLog)

  return makePublicApi({
    logger,

    init: monitor((initConfiguration: LogsInitConfiguration) => {
      if (canUseEventBridge()) {
        initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
      }

      if (!canInitLogs(initConfiguration)) {
        return
      }

      const configuration = validateAndBuildLogsConfiguration(initConfiguration)
      if (!configuration) {
        return
      }

      sendLogStrategy = startLogsImpl(configuration, logger)
      getInitConfigurationStrategy = () => deepClone(initConfiguration)
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

    getInitConfiguration: monitor(() => getInitConfigurationStrategy()),
  })

  function overrideInitConfigurationForBridge<C extends InitConfiguration>(initConfiguration: C): C {
    return { ...initConfiguration, clientToken: 'empty' }
  }

  function canInitLogs(initConfiguration: LogsInitConfiguration) {
    if (isAlreadyInitialized) {
      if (!initConfiguration.silentMultipleInit) {
        display.error('DD_LOGS is already initialized.')
      }
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
