import type { DatadogLogs } from '@datadog/browser-logs'
import type { DatadogRum } from '@datadog/browser-rum'

declare global {
  interface Window {
    DD_LOGS?: DatadogLogs
    DD_RUM?: DatadogRum
    DD_SOURCE_CODE_CONTEXT?: { [stack: string]: { service: string; version?: string } }
  }
}
