import { LogsGlobal } from '@datadog/browser-logs'
import { RumGlobal } from '@datadog/browser-rum'

declare global {
  interface Window {
    DD_LOGS?: LogsGlobal
    DD_RUM?: RumGlobal
  }

  namespace WebdriverIO {
    interface Config {
      e2eMode: string
    }
  }
}
