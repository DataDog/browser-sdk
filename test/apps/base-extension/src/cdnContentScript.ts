export {}
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { Context } from '@datadog/browser-core'

declare global {
  interface Window {
    RUM_BUNDLE_URL?: string
    LOGS_BUNDLE_URL?: string
    RUM_CONFIGURATION?: RumInitConfiguration
    RUM_CONTEXT?: Context
    LOGS_CONFIGURATION?: LogsInitConfiguration
    LOGS_CONTEXT?: Context
    DD_RUM?: {
      init: (config: Record<string, unknown>) => void
      setGlobalContext: (ctx: Record<string, unknown>) => void
    }
    DD_LOGS?: {
      init: (config: Record<string, unknown>) => void
      setGlobalContext: (ctx: Record<string, unknown>) => void
    }
  }
}

const scriptUrl = window.RUM_BUNDLE_URL || window.LOGS_BUNDLE_URL
if (scriptUrl) {
  const script = document.createElement('script')
  script.src = scriptUrl
  script.async = true
  script.onload = () => {
    if (window.RUM_CONFIGURATION && window.DD_RUM) {
      window.DD_RUM.init({ ...window.RUM_CONFIGURATION })
      if (window.RUM_CONTEXT) {
        window.DD_RUM.setGlobalContext(window.RUM_CONTEXT)
      }
    }

    if (window.LOGS_CONFIGURATION && window.DD_LOGS) {
      window.DD_LOGS.init({ ...window.LOGS_CONFIGURATION })
      if (window.LOGS_CONTEXT) {
        window.DD_LOGS.setGlobalContext(window.LOGS_CONTEXT)
      }
    }
  }
  document.documentElement.appendChild(script)
}
