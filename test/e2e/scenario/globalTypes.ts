import { LogsGlobal } from '@datadog/browser-logs'

declare global {
  interface Window {
    DD_LOGS?: LogsGlobal
  }

  namespace WebdriverIO {
    interface Config {
      e2eMode: string
    }
  }
}
