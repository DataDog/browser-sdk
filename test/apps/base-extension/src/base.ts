import { openobserveRum } from '@openobserve/browser-rum'
import { openobserveLogs } from '@openobserve/browser-logs'
import type { RumInitConfiguration } from '@openobserve/browser-rum-core'
import type { LogsInitConfiguration } from '@openobserve/browser-logs'
import type { Context } from '@openobserve/browser-core'

declare global {
  interface Window {
    EXT_RUM_CONFIGURATION?: RumInitConfiguration
    RUM_CONTEXT?: Context
    EXT_LOGS_CONFIGURATION?: LogsInitConfiguration
    LOGS_CONTEXT?: Context
  }
}

if (window.EXT_RUM_CONFIGURATION) {
  openobserveRum.init(window.EXT_RUM_CONFIGURATION)

  if (window.RUM_CONTEXT) {
    openobserveRum.setGlobalContext(window.RUM_CONTEXT)
  }
}

if (window.EXT_LOGS_CONFIGURATION) {
  openobserveLogs.init(window.EXT_LOGS_CONFIGURATION)

  if (window.LOGS_CONTEXT) {
    openobserveLogs.setGlobalContext(window.LOGS_CONTEXT)
  }
}
