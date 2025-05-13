import { datadogLogs } from '@flashcatcloud/browser-logs'
import { datadogRum } from '@flashcatcloud/browser-rum'

declare global {
  interface Window {
    LOGS_INIT?: () => void
    RUM_INIT?: () => void
  }
}

if (typeof window !== 'undefined') {
  if (window.LOGS_INIT) {
    window.LOGS_INIT()
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
