import type { Context, InitConfiguration, User } from '@datadog/browser-core'
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
  createCustomerDataTrackerManager,
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

const LOGS_STORAGE_KEY = 'logs'

export function makeLogsPublicApi(startLogsImpl: StartLogs) {
  let isAlreadyInitialized = false

  const customerDataTrackerManager = createCustomerDataTrackerManager()
  let globalContextManager = createContextManager(
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
  )
  let userContextManager = createContextManager(customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User))

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
  const mainLogger = new Logger(
    (...params) => handleLogStrategy(...params),
    customerDataTrackerManager.createDetachedTracker(CustomerDataType.LoggerContext)
  )

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

    init: monitor((initConfiguration: LogsInitConfiguration) => {
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
          customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
        )
        globalContextManager.setContext(combine(globalContextManager.getContext(), beforeInitGlobalContext))

        const beforeInitUserContext = userContextManager.getContext()
        userContextManager = createStoredContextManager(
          configuration,
          LOGS_STORAGE_KEY,
          customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User)
        )
        userContextManager.setContext(combine(userContextManager.getContext(), beforeInitUserContext))
      }

      ;({ handleLog: handleLogStrategy, getInternalContext: getInternalContextStrategy } = startLogsImpl(
        initConfiguration,
        configuration,
        buildCommonContext
      ))

      beforeInitLoggerLog.drain()

      isAlreadyInitialized = true
    }),

    getGlobalContext: monitor(() => globalContextManager.getContext()),

    setGlobalContext: monitor((context) => globalContextManager.setContext(context)),

    setGlobalContextProperty: monitor((key, value) => globalContextManager.setContextProperty(key, value)),

    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    clearGlobalContext: monitor(() => globalContextManager.clearContext()),

    createLogger: monitor((name: string, conf: LoggerConfiguration = {}) => {
      customLoggers[name] = new Logger(
        (...params) => handleLogStrategy(...params),
        customerDataTrackerManager.createDetachedTracker(CustomerDataType.LoggerContext),
        sanitize(name),
        conf.handler,
        conf.level,
        sanitize(conf.context) as object
      )

      return customLoggers[name]!
    }),

    getLogger: monitor((name: string) => customLoggers[name]),

    getInitConfiguration: monitor(() => getInitConfigurationStrategy()),

    getInternalContext: monitor((startTime?: number | undefined) => getInternalContextStrategy(startTime)),

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
