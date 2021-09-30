import { datadogLogs, LogsInitConfiguration } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

declare global {
  interface Window {
    LOGS_CONFIG?: LogsInitConfiguration
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
  datadogLogs.init({ clientToken: 'xxx', beforeSend: undefined })
  datadogRum.init({ clientToken: 'xxx', applicationId: 'xxx', beforeSend: undefined })
  datadogRum.setUser({ id: undefined })
}
