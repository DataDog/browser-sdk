// Type exports
export type {
  LogsEventDomainContext,
  NetworkLogsEventDomainContext,
  ConsoleLogsEventDomainContext,
  LoggerLogsEventDomainContext,
} from './types/domainContext.types'
export type { LogsEvent } from './types/logsEvent.types'
export type { RawLogsEvent, CommonContext } from './types/rawLogsEvent.types'

// Configuration exports
export type { LogsConfiguration } from './domain/configuration.types'
export { resolveForwardConsoleLogs, resolveForwardReports } from './domain/configuration.types'
export type { LogsSessionManager } from './domain/sessionManager.interface'

// Domain exports
export { LifeCycle } from './domain/lifeCycle'
export { createHooks as LogsHooks } from './domain/hooks'
export { Logger, HandlerType } from './domain/logger'
export type { LogsMessage } from './domain/logger'
export { StatusType } from './domain/logger/isAuthorized'
export { createErrorFieldFromRawError } from './domain/createErrorFieldFromRawError'
export { startReportError as reportError } from './domain/reportError'

// Collections exports
export { startConsoleCollection } from './domain/console/consoleCollection'
export { startReportCollection } from './domain/report/reportCollection'
export { startRuntimeErrorCollection } from './domain/runtimeError/runtimeErrorCollection'
export { startNetworkErrorCollection } from './domain/networkError/networkErrorCollection'
export { startLoggerCollection as buildLoggerCollection } from './domain/logger/loggerCollection'

// Transport exports
export { startLogsBatch } from './transport/startLogsBatch'
export { startLogsBridge } from './transport/startLogsBridge'
