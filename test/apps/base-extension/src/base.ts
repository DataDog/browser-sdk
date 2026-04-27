import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { Context } from '@datadog/browser-core'

declare global {
  interface Window {
    EXT_RUM_CONFIGURATION?: RumInitConfiguration
    RUM_CONTEXT?: Context
    EXT_LOGS_CONFIGURATION?: LogsInitConfiguration
    LOGS_CONTEXT?: Context
  }
}

if (window.EXT_RUM_CONFIGURATION) {
  datadogRum.init(window.EXT_RUM_CONFIGURATION)

  if (window.RUM_CONTEXT) {
    datadogRum.setGlobalContext(window.RUM_CONTEXT)
  }
}

if (window.EXT_LOGS_CONFIGURATION) {
  datadogLogs.init(window.EXT_LOGS_CONFIGURATION)

  if (window.LOGS_CONTEXT) {
    datadogLogs.setGlobalContext(window.LOGS_CONTEXT)
  }
}
