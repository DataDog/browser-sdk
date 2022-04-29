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
import type { HandlerType, StatusType, LogsMessage } from '../domain/logger'
import { Logger } from '../domain/logger'
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

  let handleLogStrategy: StartLogsResult['handleLog'] = (
    logsMessage: LogsMessage,
    logger: Logger,
    savedCommonContext = deepClone(getCommonContext()),
    date = timeStampNow()
  ) => {
    beforeInitLoggerLog.add(() => handleLogStrategy(logsMessage, logger, savedCommonContext, date))
  }

  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined
  const mainLogger = new Logger((...params) => handleLogStrategy(...params))

  function getCommonContext(): CommonContext {
    return {
      view: {
        referrer: document.referrer,
        url: window.location.href,
      },
      context: globalContextManager.get(),
    }
  }

  return makePublicApi({
    logger: mainLogger,

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

      ;({ handleLog: handleLogStrategy } = startLogsImpl(configuration, getCommonContext, mainLogger))
      getInitConfigurationStrategy = () => deepClone(initConfiguration)
      beforeInitLoggerLog.drain()

      isAlreadyInitialized = true
    }),

    getLoggerGlobalContext: monitor(globalContextManager.get),
    setLoggerGlobalContext: monitor(globalContextManager.set),

    addLoggerGlobalContext: monitor(globalContextManager.add),

    removeLoggerGlobalContext: monitor(globalContextManager.remove),

    createLogger: monitor((name: string, conf: LoggerConfiguration = {}) => {
      customLoggers[name] = new Logger(
        (...params) => handleLogStrategy(...params),
        name,
        conf.handler,
        conf.level,
        conf.context
      )

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
}
