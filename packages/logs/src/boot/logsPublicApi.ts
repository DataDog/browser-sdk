import type { InitConfiguration } from '@datadog/browser-core'
import {
  assign,
  BoundedBuffer,
  createContextManager,
  makePublicApi,
  monitor,
  display,
  deepClone,
  canUseEventBridge,
  timeStampNow,
} from '@datadog/browser-core'
import type { LogsInitConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'
import type { HandlerType, LoggerOptions, StatusType, LogsMessage } from '../domain/logger'
import { newLoggerOptions, Logger } from '../domain/logger'
import type { CommonContext } from '../rawLogsEvent.types'
import type { startLogs } from './startLogs'

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType | HandlerType[]
  context?: object
}

export type LogsPublicApi = ReturnType<typeof makeLogsPublicApi>

export type StartLogs = typeof startLogs

type StartLogsResult = ReturnType<typeof startLogs>

export function makeLogsPublicApi(startLogsImpl: StartLogs) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  const customLoggers: { [name: string]: Logger | undefined } = {}

  const beforeInitLoggerLog = new BoundedBuffer()

  let addLogStrategy: StartLogsResult['addLog'] = (
    logsMessage: LogsMessage,
    loggerOptions: LoggerOptions,
    savedCommonContext = deepClone(getCommonContext())
  ) => {
    beforeInitLoggerLog.add(() => addLogStrategy(logsMessage, loggerOptions, savedCommonContext))
  }

  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined
  const mainLoggerOptions = newLoggerOptions()
  const logger = createLogger(mainLoggerOptions)

  function getCommonContext(): CommonContext {
    return {
      date: timeStampNow(),
      view: {
        referrer: document.referrer,
        url: window.location.href,
      },
      context: globalContextManager.get(),
    }
  }

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

      ;({ addLog: addLogStrategy } = startLogsImpl(configuration, getCommonContext, mainLoggerOptions))
      getInitConfigurationStrategy = () => deepClone(initConfiguration)
      beforeInitLoggerLog.drain()

      isAlreadyInitialized = true
    }),

    getLoggerGlobalContext: monitor(globalContextManager.get),
    setLoggerGlobalContext: monitor(globalContextManager.set),

    addLoggerGlobalContext: monitor(globalContextManager.add),

    removeLoggerGlobalContext: monitor(globalContextManager.remove),

    createLogger: monitor((name: string, conf: LoggerConfiguration = {}) => {
      customLoggers[name] = createLogger(newLoggerOptions(name, conf.handler, conf.level, conf.context))
      return customLoggers[name]!
    }),

    getLogger: monitor((name: string) => customLoggers[name]),

    getInitConfiguration: monitor(() => getInitConfigurationStrategy()),
  })

  function overrideInitConfigurationForBridge<C extends InitConfiguration>(initConfiguration: C): C {
    return assign({}, initConfiguration, { clientToken: 'empty' })
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

  function createLogger(options: LoggerOptions) {
    return new Logger(options, (...params) => addLogStrategy(...params))
  }
}
