import type { Context, TrackingConsent, User } from '@datadog/browser-core'
import {
  CustomerDataType,
  assign,
  createContextManager,
  makePublicApi,
  monitor,
  checkUser,
  sanitizeUser,
  sanitize,
  createCustomerDataTrackerManager,
  storeContextManager,
  displayAlreadyInitializedError,
  deepClone,
  createTrackingConsentState,
} from '@datadog/browser-core'
import type { LogsInitConfiguration } from '../domain/configuration'
import type { HandlerType, StatusType } from '../domain/logger'
import { Logger } from '../domain/logger'
import { buildCommonContext } from '../domain/contexts/commonContext'
import type { StartLogs, StartLogsResult } from './startLogs'
import { createPreStartStrategy } from './preStartLogs'

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType | HandlerType[]
  context?: object
}

export type LogsPublicApi = ReturnType<typeof makeLogsPublicApi>

const LOGS_STORAGE_KEY = 'logs'

export interface Strategy {
  init: (initConfiguration: LogsInitConfiguration) => void
  initConfiguration: LogsInitConfiguration | undefined
  getInternalContext: StartLogsResult['getInternalContext']
  handleLog: StartLogsResult['handleLog']
}

export function makeLogsPublicApi(startLogsImpl: StartLogs) {
  const customerDataTrackerManager = createCustomerDataTrackerManager()
  const globalContextManager = createContextManager(
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
  )
  const userContextManager = createContextManager(customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User))
  const trackingConsentState = createTrackingConsentState()

  function getCommonContext() {
    return buildCommonContext(globalContextManager, userContextManager)
  }

  let strategy = createPreStartStrategy(getCommonContext, trackingConsentState, (initConfiguration, configuration) => {
    if (initConfiguration.storeContextsAcrossPages) {
      storeContextManager(configuration, globalContextManager, LOGS_STORAGE_KEY, CustomerDataType.GlobalContext)
      storeContextManager(configuration, userContextManager, LOGS_STORAGE_KEY, CustomerDataType.User)
    }

    const startLogsResult = startLogsImpl(initConfiguration, configuration, getCommonContext, trackingConsentState)

    strategy = createPostStartStrategy(initConfiguration, startLogsResult)
    return startLogsResult
  })

  const customLoggers: { [name: string]: Logger | undefined } = {}

  const mainLogger = new Logger(
    (...params) => strategy.handleLog(...params),
    customerDataTrackerManager.createDetachedTracker()
  )

  return makePublicApi({
    logger: mainLogger,

    init: monitor((initConfiguration: LogsInitConfiguration) => strategy.init(initConfiguration)),

    /**
     * Set the tracking consent of the current user.
     *
     * @param {"granted" | "not-granted"} trackingConsent The user tracking consent
     *
     * Logs will be sent only if it is set to "granted". This value won't be stored by the library
     * across page loads: you will need to call this method or set the appropriate `trackingConsent`
     * field in the init() method at each page load.
     *
     * If this method is called before the init() method, the provided value will take precedence
     * over the one provided as initialization parameter.
     */
    setTrackingConsent: monitor((trackingConsent: TrackingConsent) => trackingConsentState.update(trackingConsent)),

    getGlobalContext: monitor(() => globalContextManager.getContext()),

    setGlobalContext: monitor((context) => globalContextManager.setContext(context)),

    setGlobalContextProperty: monitor((key, value) => globalContextManager.setContextProperty(key, value)),

    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    clearGlobalContext: monitor(() => globalContextManager.clearContext()),

    createLogger: monitor((name: string, conf: LoggerConfiguration = {}) => {
      customLoggers[name] = new Logger(
        (...params) => strategy.handleLog(...params),
        customerDataTrackerManager.createDetachedTracker(),
        sanitize(name),
        conf.handler,
        conf.level,
        sanitize(conf.context) as object
      )

      return customLoggers[name]!
    }),

    getLogger: monitor((name: string) => customLoggers[name]),

    getInitConfiguration: monitor(() => deepClone(strategy.initConfiguration)),

    getInternalContext: monitor((startTime?: number | undefined) => strategy.getInternalContext(startTime)),

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
}

function createPostStartStrategy(initConfiguration: LogsInitConfiguration, startLogsResult: StartLogsResult): Strategy {
  return assign(
    {
      init: (initConfiguration: LogsInitConfiguration) => {
        displayAlreadyInitializedError('DD_LOGS', initConfiguration)
      },
      initConfiguration,
    },
    startLogsResult
  )
}
