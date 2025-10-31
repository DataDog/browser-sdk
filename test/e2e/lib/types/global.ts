import type { DatadogLogs } from '@datadog/browser-logs'
import type { DatadogRum } from '@datadog/browser-rum'

declare global {
  interface Window {
    DD_LOGS?: DatadogLogs
    DD_RUM?: DatadogRum
  }
}
