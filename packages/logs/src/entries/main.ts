/**
 * @packageDocumentation
 * Datadog Browser Logs SDK for collecting and forwarding browser logs to Datadog.
 * Provides comprehensive logging capabilities with automatic error tracking and custom log collection.
 *
 * @see {@link https://docs.datadoghq.com/logs/log_collection/javascript/ | Browser Log Collection}
 */

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

/**
 * The global Logs instance. Use this to call Logs methods.
 * @see {@link https://docs.datadoghq.com/logs/log_collection/javascript/ | Browser Log Collection}
 */
export const datadogLogs = makeLogsPublicApi(startLogs)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LOGS', datadogLogs)
