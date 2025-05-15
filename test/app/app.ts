import { flashcatLogs } from '@flashcatcloud/browser-logs'
import { flashcatRum } from '@flashcatcloud/browser-rum'

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
  flashcatLogs.init({ clientToken: 'xxx', beforeSend: undefined })
  flashcatRum.init({ clientToken: 'xxx', applicationId: 'xxx', beforeSend: undefined })
  flashcatRum.setUser({ id: undefined })
}
