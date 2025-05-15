import { defineGlobal, getGlobalObject } from '@flashcatcloud/browser-core'
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

export const flashcatLogs = makeLogsPublicApi(startLogs)

interface BrowserWindow extends Window {
  FC_LOGS?: LogsPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'FC_LOGS', flashcatLogs)
