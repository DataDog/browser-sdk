import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { LogsPublicApi } from '../boot/logsPublicApi'
import { makeLogsPublicApi } from '../boot/logsPublicApi'
import { startLogs } from '../boot/startLogs'

export type { LogsMessage } from '../domain/logger'
export { Logger, HandlerType } from '../domain/logger'
export { StatusType } from '../domain/logger/isAuthorized'
export type { LoggerConfiguration, LogsPublicApi as LogsGlobal } from '../boot/logsPublicApi'
export type { LogsInitConfiguration } from '../domain/configuration'
export type { LogsEvent } from '../logsEvent.types'
export type { LogsEventDomainContext } from '../domainContext.types'

export const datadogLogs = makeLogsPublicApi(startLogs)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LOGS', datadogLogs)
