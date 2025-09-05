import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

if (window.RUM_CONFIGURATION) {
  datadogRum.init({ ...window.RUM_CONFIGURATION })

  if (window.RUM_CONTEXT) {
    datadogRum.setGlobalContext(window.RUM_CONTEXT)
  }
}

if (window.LOGS_CONFIGURATION) {
  datadogLogs.init({ ...window.LOGS_CONFIGURATION })

  if (window.LOGS_CONTEXT) {
    datadogLogs.setGlobalContext(window.LOGS_CONTEXT)
  }
}
