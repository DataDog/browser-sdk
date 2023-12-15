import { createInjector, defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { LogsPublicApi } from '../boot/logsPublicApi'
import { makeLogsPublicApi } from '../boot/logsPublicApi'

export { Logger, LogsMessage, StatusType, HandlerType } from '../domain/logger'
export { LoggerConfiguration, LogsPublicApi as LogsGlobal } from '../boot/logsPublicApi'
export { LogsInitConfiguration } from '../domain/configuration'
export { LogsEvent } from '../logsEvent.types'

const injector = createInjector()
export const datadogLogs = injector.run(makeLogsPublicApi)

interface BrowserWindow extends Window {
  DD_LOGS?: LogsPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LOGS', datadogLogs)
