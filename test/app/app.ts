import { datadogLogs, LogsUserConfiguration } from '@datadog/browser-logs'
import { datadogRum, RumUserConfiguration } from '@datadog/browser-rum-recorder'

declare global {
  interface Window {
    LOGS_CONFIG?: LogsUserConfiguration
    RUM_CONFIG?: RumUserConfiguration
  }
}

if (typeof window !== 'undefined') {
  if (window.LOGS_CONFIG) {
    datadogLogs.init(window.LOGS_CONFIG)
  }

  if (window.RUM_CONFIG) {
    datadogRum.init(window.RUM_CONFIG)
  }
} else {
  // compat test
  datadogLogs.init({ clientToken: 'xxx' })
  datadogRum.init({ clientToken: 'xxx', applicationId: 'xxx' })
}
