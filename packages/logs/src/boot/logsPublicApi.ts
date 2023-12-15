import type {
  AnyComponent,
  Component,
  Context,
  ContextManager,
  InitConfiguration,
  Injector,
  User,
} from '@datadog/browser-core'
import {
  CustomerDataType,
  assign,
  BoundedBuffer,
  createContextManager,
  makePublicApi,
  monitor,
  display,
  deepClone,
  canUseEventBridge,
  timeStampNow,
  checkUser,
  sanitizeUser,
  sanitize,
  createStoredContextManager,
  combine,
  getConfiguration,
  getInitConfiguration,
  getInjector,
} from '@datadog/browser-core'
import type { LogsInitConfiguration } from '../domain/configuration'
import {
  getLogsConfiguration,
  getLogsInitConfiguration,
  validateAndBuildLogsConfiguration,
} from '../domain/configuration'
import type { HandlerType, StatusType, LogsMessage } from '../domain/logger'
import { Logger } from '../domain/logger'
import type { CommonContext } from '../rawLogsEvent.types'
import { getBuildLogsCommonContext } from '../domain/commonContext'
import { startLogs } from './startLogs'
import type { StartLogsResult } from './startLogs'

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType | HandlerType[]
  context?: object
}

export interface LogsPublicApi {
  logger: Logger
  version: string

  init: (initConfiguration: LogsInitConfiguration) => void

  createLogger: (name: string, conf?: LoggerConfiguration) => Logger
  getLogger: (name: string) => Logger | undefined

  getInitConfiguration: () => InitConfiguration | undefined
  getInternalContext: StartLogsResult['getInternalContext']

  getGlobalContext: ContextManager['getContext']
  setGlobalContext: ContextManager['setContext']
  setGlobalContextProperty: ContextManager['setContextProperty']
  removeGlobalContextProperty: ContextManager['removeContextProperty']
  clearGlobalContext: ContextManager['clearContext']

  setUser: ContextManager['setContext']
  getUser: ContextManager['getContext']
  setUserProperty: ContextManager['setContextProperty']
  removeUserProperty: ContextManager['removeContextProperty']
  clearUser: ContextManager['clearContext']
}

export type StartLogs = AnyComponent<StartLogsResult>

const LOGS_STORAGE_KEY = 'logs'

export const makeLogsPublicApi: Component<LogsPublicApi, [Injector]> = (injector) => {
  let isAlreadyInitialized = false

  let globalContextManager = createContextManager(CustomerDataType.GlobalContext)
  let userContextManager = createContextManager(CustomerDataType.User)

  const customLoggers: { [name: string]: Logger | undefined } = {}
  let getInternalContextStrategy: StartLogsResult['getInternalContext'] = () => undefined

  const beforeInitLoggerLog = new BoundedBuffer()

  let handleLogStrategy: StartLogsResult['handleLog'] = (
    logsMessage: LogsMessage,
    logger: Logger,
    savedCommonContext = deepClone(buildCommonContext()),
    date = timeStampNow()
  ) => {
    beforeInitLoggerLog.add(() => handleLogStrategy(logsMessage, logger, savedCommonContext, date))
  }

  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined
  const mainLogger = new Logger((...params) => handleLogStrategy(...params))

  function buildCommonContext(): CommonContext {
    return {
      view: {
        referrer: document.referrer,
        url: window.location.href,
      },
      context: globalContextManager.getContext(),
      user: userContextManager.getContext(),
    }
  }

  return makePublicApi({
    logger: mainLogger,

    init: monitor((initConfiguration) => {
      if (!initConfiguration) {
        display.error('Missing configuration')
        return
      }
      // This function should be available, regardless of initialization success.
      getInitConfigurationStrategy = () => deepClone(initConfiguration)

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

      if (initConfiguration.storeContextsAcrossPages) {
        const beforeInitGlobalContext = globalContextManager.getContext()
        globalContextManager = createStoredContextManager(
          configuration,
          LOGS_STORAGE_KEY,
          CustomerDataType.GlobalContext
        )
        globalContextManager.setContext(combine(globalContextManager.getContext(), beforeInitGlobalContext))

        const beforeInitUserContext = userContextManager.getContext()
        userContextManager = createStoredContextManager(configuration, LOGS_STORAGE_KEY, CustomerDataType.User)
        userContextManager.setContext(combine(userContextManager.getContext(), beforeInitUserContext))
      }

      injector.override(getConfiguration, () => configuration)
      injector.override(getLogsConfiguration, () => configuration)
      injector.override(getInitConfiguration, () => initConfiguration)
      injector.override(getLogsInitConfiguration, () => initConfiguration)
      injector.override(getBuildLogsCommonContext, () => buildCommonContext)
      ;({ handleLog: handleLogStrategy, getInternalContext: getInternalContextStrategy } = injector.run(startLogs))

      beforeInitLoggerLog.drain()

      isAlreadyInitialized = true
    }),

    getGlobalContext: monitor(() => globalContextManager.getContext()),

    setGlobalContext: monitor((context) => globalContextManager.setContext(context)),

    setGlobalContextProperty: monitor((key, value) => globalContextManager.setContextProperty(key, value)),

    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    clearGlobalContext: monitor(() => globalContextManager.clearContext()),

    createLogger: monitor((name, conf = {}) => {
      customLoggers[name] = new Logger(
        (...params) => handleLogStrategy(...params),
        sanitize(name),
        conf.handler,
        conf.level,
        sanitize(conf.context) as object
      )

      return customLoggers[name]!
    }),

    getLogger: monitor((name) => customLoggers[name]),

    getInitConfiguration: monitor(() => getInitConfigurationStrategy()),

    getInternalContext: monitor((startTime) => getInternalContextStrategy(startTime)),

    setUser: monitor((newUser: User) => {
      if (checkUser(newUser)) {
        userContextManager.setContext(sanitizeUser(newUser as Context))
      }
    }),

    getUser: monitor(() => userContextManager.getContext()),

    setUserProperty: monitor((key, property) => {
      const sanitizedProperty = sanitizeUser({ [key]: property })[key]
      userContextManager.setContextProperty(key, sanitizedProperty)
    }),

    removeUserProperty: monitor((key) => userContextManager.removeContextProperty(key)),

    clearUser: monitor(() => userContextManager.clearContext()),
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

// eslint-disable-next-line local-rules/disallow-side-effects
makeLogsPublicApi.$deps = [getInjector]
