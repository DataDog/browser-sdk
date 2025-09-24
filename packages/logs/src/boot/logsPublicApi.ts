import type { TrackingConsent, PublicApi, ContextManager, Account, Context, User } from '@datadog/browser-core'
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
  startBufferingData,
  callMonitored,
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

/**
 * Public API for the Logs browser SDK.
 *
 * See [Browser Log Collection](https://docs.datadoghq.com/logs/log_collection/javascript) for further information.
 *
 * @category API
 */
export interface LogsPublicApi extends PublicApi {
  /**
   * The default logger
   *
   * @category Logger
   */
  logger: Logger

  /**
   * Init the Logs browser SDK.
   *
   * See [Browser Log Collection](https://docs.datadoghq.com/logs/log_collection/javascript) for further information.
   *
   * @category Init
   * @param initConfiguration - Configuration options of the SDK
   */
  init: (initConfiguration: LogsInitConfiguration) => void

  /**
   * Set the tracking consent of the current user.
   *
   * Logs will be sent only if it is set to "granted". This value won't be stored by the library
   * across page loads: you will need to call this method or set the appropriate `trackingConsent`
   * field in the init() method at each page load.
   *
   * If this method is called before the init() method, the provided value will take precedence
   * over the one provided as initialization parameter.
   *
   * See [User tracking consent](https://docs.datadoghq.com/logs/log_collection/javascript/#user-tracking-consent) for further information.
   *
   * @category Privacy
   * @param trackingConsent - The user tracking consent
   */
  setTrackingConsent: (trackingConsent: TrackingConsent) => void

  /**
   * Set the global context information to all events, stored in `@context`
   * See [Global context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   *
   * @category Context - Global Context
   * @param context - Global context
   */
  setGlobalContext: (context: any) => void

  /**
   * Get the global Context
   *
   * See [Global context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   *
   * @category Context - Global Context
   */
  getGlobalContext: () => Context

  /**
   * Set or update a global context property, stored in `@context.<key>`
   *
   * See [Global context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   *
   * @category Context - Global Context
   * @param key - Key of the property
   * @param value - Value of the property
   */
  setGlobalContextProperty: (key: any, value: any) => void

  /**
   * Remove a global context property
   *
   * See [Global context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   *
   * @category Context - Global Context
   */
  removeGlobalContextProperty: (key: any) => void

  /**
   * Clear the global context
   *
   * See [Global context](https://docs.datadoghq.com/logs/log_collection/javascript/#overwrite-context) for further information.
   *
   * @category Context - Global Context
   */
  clearGlobalContext: () => void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * See [User session](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   *
   * @category Context - User
   * @param newUser - User information
   */
  setUser(newUser: User & { id: string }): void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * @category Context - User
   * @deprecated You must specify a user id, favor using {@link setUser} instead
   * @param newUser - User information with optional id
   */
  setUser(newUser: User): void

  /**
   * Get user information
   *
   * See [User session](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   *
   * @category Context - User
   * @returns User information
   */
  getUser: () => Context

  /**
   * Set or update the user property, stored in `@usr.<key>`
   *
   * See [User session](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   *
   * @category Context - User
   * @param key - Key of the property
   * @param property - Value of the property
   */
  setUserProperty: (key: any, property: any) => void

  /**
   * Remove a user property
   *
   * @category Context - User
   * @param key - Key of the property to remove
   * @see [User session](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   */
  removeUserProperty: (key: any) => void

  /**
   * Clear all user information
   *
   * See [User session](https://docs.datadoghq.com/logs/log_collection/javascript/#user-context) for further information.
   *
   * @category Context - User
   */
  clearUser: () => void

  /**
   * Set account information to all events, stored in `@account`
   *
   * @category Context - Account
   * @param newAccount - Account information
   */
  setAccount: (newAccount: Account) => void

  /**
   * Get account information
   *
   * @category Context - Account
   * @returns Account information
   */
  getAccount: () => Context

  /**
   * Set or update the account property, stored in `@account.<key>`
   *
   * @category Context - Account
   * @param key - Key of the property
   * @param property - Value of the property
   */
  setAccountProperty: (key: string, property: any) => void

  /**
   * Remove an account property
   *
   * @category Context - Account
   * @param key - Key of the property to remove
   */
  removeAccountProperty: (key: string) => void

  /**
   * Clear all account information
   *
   * @category Context - Account
   * @returns Clear all account information
   */
  clearAccount: () => void

  /**
   * The Datadog browser logs SDK contains a default logger `DD_LOGS.logger`, but this API allows to create different ones.
   *
   * See [Define multiple loggers](https://docs.datadoghq.com/logs/log_collection/javascript/#define-multiple-loggers) for further information.
   *
   * @category Logger
   * @param name - Name of the logger
   * @param conf - Configuration of the logger (level, handler, context)
   */
  createLogger: (name: string, conf?: LoggerConfiguration) => Logger

  /**
   * Get a logger
   *
   * See [Define multiple loggers](https://docs.datadoghq.com/logs/log_collection/javascript/#define-multiple-loggers) for further information.
   *
   * @category Logger
   * @param name - Name of the logger
   */
  getLogger: (name: string) => Logger | undefined

  /**
   * Get the init configuration
   *
   * @category Init
   * @returns The init configuration
   */
  getInitConfiguration: () => LogsInitConfiguration | undefined

  /**
   * [Internal API] Get the internal SDK context
   *
   * See [Access internal context](https://docs.datadoghq.com/logs/log_collection/javascript/#access-internal-context) for further information.
   *
   * @internal
   */
  getInternalContext: (startTime?: number) => InternalContext | undefined
}

export interface Strategy {
  init: (initConfiguration: LogsInitConfiguration, errorStack?: string) => void
  initConfiguration: LogsInitConfiguration | undefined
  globalContext: ContextManager
  accountContext: ContextManager
  userContext: ContextManager
  getInternalContext: StartLogsResult['getInternalContext']
  handleLog: StartLogsResult['handleLog']
}

export function makeLogsPublicApi(startLogsImpl: StartLogs): LogsPublicApi {
  const trackingConsentState = createTrackingConsentState()
  const bufferedDataObservable = startBufferingData().observable

  let strategy = createPreStartStrategy(
    buildCommonContext,
    trackingConsentState,
    (initConfiguration, configuration) => {
      const startLogsResult = startLogsImpl(
        configuration,
        buildCommonContext,
        trackingConsentState,
        bufferedDataObservable
      )

      strategy = createPostStartStrategy(initConfiguration, startLogsResult)
      return startLogsResult
    }
  )

  const getStrategy = () => strategy

  const customLoggers: { [name: string]: Logger | undefined } = {}

  const mainLogger = new Logger((...params) => strategy.handleLog(...params))

  return makePublicApi<LogsPublicApi>({
    logger: mainLogger,

    init: (initConfiguration) => {
      const errorStack = new Error().stack
      callMonitored(() => strategy.init(initConfiguration, errorStack))
    },

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
