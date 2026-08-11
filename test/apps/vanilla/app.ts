import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'
import { datadogDebugger } from '@datadog/browser-debugger'

declare global {
  interface Window {
    LOGS_INIT?: () => void
    RUM_INIT?: () => void
    DEBUGGER_INIT?: () => void
    DD_PRE_INIT?: () => unknown
  }
}

function runInits() {
  if (window.LOGS_INIT) {
    window.LOGS_INIT()
  }

  if (window.RUM_INIT) {
    window.RUM_INIT()
  }

  if (window.DEBUGGER_INIT) {
    window.DEBUGGER_INIT()
  }
}

if (typeof window !== 'undefined') {
  if (window.DD_PRE_INIT) {
    // Application code running once the SDK modules are evaluated — and therefore instrumenting
    // the page — but before init(). It may return a promise to hold init() back until it settles.
    void Promise.resolve(window.DD_PRE_INIT()).then(runInits)
  } else {
    runInits()
  }
} else {
  // compat test
  datadogLogs.init({ clientToken: 'xxx', beforeSend: undefined })
  datadogRum.init({ clientToken: 'xxx', applicationId: 'xxx', beforeSend: undefined })
  datadogRum.setUser({ id: undefined })
  datadogDebugger.init({ clientToken: 'xxx', service: 'xxx' })
}
