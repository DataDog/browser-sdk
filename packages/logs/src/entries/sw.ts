/**
 * Datadog Browser Logs SDK – Service Worker entry.
 *
 * Usage inside a Service Worker:
 * ```js
 * // sw.js
 * importScripts('https://cdn.datadoghq.com/browser/6/datadog-logs-sw.js')
 * datadogLogs.init({
 *   clientToken: 'XXX',
 *   site: 'datadoghq.com',
 *   service: 'my-sw',
 *   forwardErrorsToLogs: true,
 * })
 * ```
 */

import { defineGlobal, getGlobalObject, ensureServiceWorkerGlobals } from '@datadog/browser-core'
import { makeLogsPublicApi } from '../boot/logsPublicApi'
import { startLogs } from '../boot/startLogs'
import type { LogsPublicApi } from '../boot/logsPublicApi'

// Apply minimal polyfills (`window`, `document`) when running in a Service Worker.
ensureServiceWorkerGlobals()

export const datadogLogs = makeLogsPublicApi(startLogs)

interface WorkerGlobal {
  DD_LOGS?: LogsPublicApi
}

defineGlobal(getGlobalObject<WorkerGlobal>(), 'DD_LOGS', datadogLogs) 