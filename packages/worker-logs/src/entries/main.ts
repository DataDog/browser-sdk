/**
 *
 * Datadog Browser Logs SDK for collecting and forwarding browser logs to Datadog.
 * Provides comprehensive logging capabilities with automatic error tracking and custom log collection.
 *
 * @packageDocumentation
 * @see [Browser Log Collection](https://docs.datadoghq.com/logs/log_collection/javascript/)
 */

import { defineGlobal, getGlobalObject, ensureServiceWorkerGlobals } from '@datadog/browser-core'
import type { LogsPublicApi } from '../boot/logsPublicApi'
import { makeLogsPublicApi } from '../boot/logsPublicApi'
import { startLogs } from '../boot/startLogs'

export type { InternalContext } from '../domain/contexts/internalContext'
export type { LogsMessage } from '../domain/logger'
export { Logger, HandlerType } from '../domain/logger'
export { StatusType } from '../domain/logger/isAuthorized'
export type { LoggerConfiguration, LogsPublicApi as LogsGlobal } from '../boot/logsPublicApi'
export type { LogsInitConfiguration } from '../domain/configuration'
export type { LogsEvent } from '../logsEvent.types'
export type {
  LogsEventDomainContext,
  NetworkLogsEventDomainContext,
  ConsoleLogsEventDomainContext,
  LoggerLogsEventDomainContext,
} from '../domainContext.types'

export type {
  InitConfiguration,
  PublicApi,
  Context,
  ContextValue,
  ContextArray,
  User,
  Account,
  TraceContextInjection,
  MatchOption,
  ProxyFn,
  Site,
  ConsoleApiName,
  RawReportType,
  ErrorSource,
} from '@datadog/browser-core'

/**
 * The global Logs instance. Use this to call Logs methods.
 *
 * @see [Browser Log Collection](https://docs.datadoghq.com/logs/log_collection/javascript/)
 */

// eslint-disable-next-line local-rules/disallow-side-effects
ensureServiceWorkerGlobals()

// eslint-disable-next-line local-rules/disallow-side-effects
export const datadogLogs = makeLogsPublicApi(startLogs)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsPublicApi
}
// eslint-disable-next-line local-rules/disallow-side-effects
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LOGS', datadogLogs)
