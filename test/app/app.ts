import { datadogLogs, LogsUserConfiguration } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum-recorder'

declare global {
  interface Window {
    LOGS_CONFIG?: LogsUserConfiguration
    RUM_INIT?: () => void
  }
}

if (typeof window !== 'undefined') {
  if (window.LOGS_CONFIG) {
    datadogLogs.init(window.LOGS_CONFIG)
  }

  if (window.RUM_INIT) {
    window.RUM_INIT()
  }
} else {
  // compat test
  datadogLogs.init({ clientToken: 'xxx' })
  datadogRum.init({ clientToken: 'xxx', applicationId: 'xxx' })
}
