export { Logger, LogsMessage, StatusType, HandlerType } from './domain/logger'
export { LoggerConfiguration, LogsPublicApi as LogsGlobal, datadogLogs } from './boot/logs.entry'
export { LogsInitConfiguration, LogsUserConfiguration } from './boot/startLogs'
export { LogsEvent } from './logsEvent.types'
