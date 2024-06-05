import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { LogsPublicApi } from '../boot/logsPublicApi'
import { makeLogsPublicApi } from '../boot/logsPublicApi'
import { startLogs } from '../boot/startLogs'

export { Logger, LogsMessage, HandlerType } from '../domain/logger'
export { StatusType } from '../domain/logger/isAuthorized'
export { LoggerConfiguration, LogsPublicApi as LogsGlobal } from '../boot/logsPublicApi'
export { LogsInitConfiguration } from '../domain/configuration'
export { LogsEvent } from '../logsEvent.types'
export { LogsEventDomainContext } from '../domainContext.types'

export const datadogLogs = makeLogsPublicApi(startLogs)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LOGS', datadogLogs)
