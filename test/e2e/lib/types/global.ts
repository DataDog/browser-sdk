import type { LogsGlobal } from '@datadog/browser-logs'
import type { RumGlobal } from '@datadog/browser-rum'

declare global {
  interface Window {
    DD_LOGS?: LogsGlobal
    DD_RUM?: RumGlobal
  }
}
