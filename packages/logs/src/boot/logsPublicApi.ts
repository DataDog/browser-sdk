import type { Account, Context, TrackingConsent, User, PublicApi, ContextManager } from '@datadog/browser-core'
import {
  ContextManagerMethod,
  CustomerContextKey,
  addTelemetryUsage,
  makePublicApi,
  monitor,
  sanitize,
  displayAlreadyInitializedError,
  deepClone,
  createTrackingConsentState,
  defineContextMethod,
} from '@datadog/browser-core'
import type { LogsInitConfiguration } from '../domain/configuration'
import type { HandlerType } from '../domain/logger'
import type { StatusType } from '../domain/logger/isAuthorized'
import { Logger } from '../domain/logger'
import { buildCommonContext } from '../domain/contexts/commonContext'
import type { InternalContext } from '../domain/contexts/internalContext'
import type { StartLogs, StartLogsResult } from './startLogs'
import { createPreStartStrategy } from './preStartLogs'

export interface LoggerConfiguration {
  level?: StatusType
  handler?: HandlerType | HandlerType[]
  context?: object
}

export interface LogsPublicApi extends PublicApi {
  logger: Logger

  /**
   * Init the Logs browser SDK.
   * @param initConfiguration Configuration options of the SDK
   *
   * See [Browser Log Collection](https://docs.datadoghq.com/logs/log_collection/javascript) for further information.
   */
  init: (initConfiguration: LogsInitConfiguration) => void

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
  setTrackingConsent: (trackingConsent: TrackingConsent) => void

  /**
   * Get the global Context
   *
   * See [Overwrite context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   */
  getGlobalContext: () => Context

  /**
   * Set the global context information to all logs, stored in `@context`
   *
   * @param context Global context
   *
   * See [Overwrite context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   */
  setGlobalContext: (context: any) => void

  /**
   * Set or update a global context property, stored in `@context.<key>`
   *
   * @param key Key of the property
   * @param property Value of the property
   *
   * See [Overwrite context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   */
  setGlobalContextProperty: (key: any, value: any) => void

  /**
   * Remove a global context property
   *
   * See [Overwrite context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   */
  removeGlobalContextProperty: (key: any) => void

  /**
   * Clear the global context
   *
   * See [Overwrite context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   */
  clearGlobalContext: () => void

  /**
   * The Datadog browser logs SDK contains a default logger `DD_LOGS.logger`, but this API allows to create different ones.
   *
   * See [Define multiple loggers](https://docs.datadoghq.com/logs/log_collection/javascript/#define-multiple-loggers) for further information.
   */
  createLogger: (name: string, conf?: LoggerConfiguration) => Logger

  /**
   * Get a logger
   *
   * See [Define multiple loggers](https://docs.datadoghq.com/logs/log_collection/javascript/#define-multiple-loggers) for further information.
   */
  getLogger: (name: string) => Logger | undefined

  /**
   * Get the init configuration
   */
  getInitConfiguration: () => LogsInitConfiguration | undefined

  /**
   * [Internal API] Get the internal SDK context
   *
   * See [Access internal context](https://docs.datadoghq.com/logs/log_collection/javascript/#access-internal-context) for further information.
   */
  getInternalContext: (startTime?: number) => InternalContext | undefined

  /**
   * Set user information to all events, stored in `@usr`
   *
   * See [User context](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   */
  setUser(newUser: User & { id: string }): void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * @deprecated You must specified a user id
   * @see {@link setUser}
   */
  setUser(newUser: User): void

  /**
   * Get user information
   *
   * See [User context](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   */
  getUser: () => Context

  /**
   * Set or update the user property, stored in `@usr.<key>`
   *
   * @param key Key of the property
   * @param property Value of the property
   *
   * See [User context](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   */
  setUserProperty: (key: any, property: any) => void

  /**
   * Remove a user property
   *
   * See [User context](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   */
  removeUserProperty: (key: any) => void

  /**
   * Clear all user information
   *
   * See [User context](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   */
  clearUser: () => void

  /**
   * Set account information to all events, stored in `@account`
   */
  setAccount: (newAccount: Account) => void

  /**
   * Get account information
   */
  getAccount: () => Context

  /**
   * Set or update the account property, stored in `@account.<key>`
   *
   * @param key Key of the property
   * @param property Value of the property
   */
  setAccountProperty: (key: string, property: any) => void

  /**
   * Remove an account property
   */
  removeAccountProperty: (key: string) => void

  /**
   * Clear all account information
   */
  clearAccount: () => void
}

export interface Strategy {
  init: (initConfiguration: LogsInitConfiguration) => void
  initConfiguration: LogsInitConfiguration | undefined
  globalContext: ContextManager
  accountContext: ContextManager
  userContext: ContextManager
  getInternalContext: StartLogsResult['getInternalContext']
  handleLog: StartLogsResult['handleLog']
}

export function makeLogsPublicApi(startLogsImpl: StartLogs): LogsPublicApi {
  const trackingConsentState = createTrackingConsentState()

  let strategy = createPreStartStrategy(
    buildCommonContext,
    trackingConsentState,
    (initConfiguration, configuration) => {
      const startLogsResult = startLogsImpl(configuration, buildCommonContext, trackingConsentState)

      strategy = createPostStartStrategy(initConfiguration, startLogsResult)
      return startLogsResult
    }
  )

  const getStrategy = () => strategy

  const customLoggers: { [name: string]: Logger | undefined } = {}

  const mainLogger = new Logger((...params) => strategy.handleLog(...params))

  return makePublicApi<LogsPublicApi>({
    logger: mainLogger,

    init: monitor((initConfiguration) => strategy.init(initConfiguration)),

    setTrackingConsent: monitor((trackingConsent) => {
      trackingConsentState.update(trackingConsent)
      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: trackingConsent })
    }),

    getGlobalContext: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.getContext
    ),
    setGlobalContext: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.setContext
    ),

    setGlobalContextProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.setContextProperty
    ),

    removeGlobalContextProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.removeContextProperty
    ),

    clearGlobalContext: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.clearContext
    ),

    createLogger: monitor((name, conf = {}) => {
      customLoggers[name] = new Logger(
        (...params) => strategy.handleLog(...params),
        sanitize(name),
        conf.handler,
        conf.level,
        sanitize(conf.context) as object
      )

      return customLoggers[name]
    }),

    getLogger: monitor((name) => customLoggers[name]),

    getInitConfiguration: monitor(() => deepClone(strategy.initConfiguration)),

    getInternalContext: monitor((startTime) => strategy.getInternalContext(startTime)),

    setUser: defineContextMethod(getStrategy, CustomerContextKey.userContext, ContextManagerMethod.setContext),

    getUser: defineContextMethod(getStrategy, CustomerContextKey.userContext, ContextManagerMethod.getContext),

    setUserProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.setContextProperty
    ),

    removeUserProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.removeContextProperty
    ),

    clearUser: defineContextMethod(getStrategy, CustomerContextKey.userContext, ContextManagerMethod.clearContext),

    setAccount: defineContextMethod(getStrategy, CustomerContextKey.accountContext, ContextManagerMethod.setContext),

    getAccount: defineContextMethod(getStrategy, CustomerContextKey.accountContext, ContextManagerMethod.getContext),

    setAccountProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.setContextProperty
    ),

    removeAccountProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.removeContextProperty
    ),

    clearAccount: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.clearContext
    ),
  })
}

function createPostStartStrategy(initConfiguration: LogsInitConfiguration, startLogsResult: StartLogsResult): Strategy {
  return {
    init: (initConfiguration: LogsInitConfiguration) => {
      displayAlreadyInitializedError('DD_LOGS', initConfiguration)
    },
    initConfiguration,
    ...startLogsResult,
  }
}
