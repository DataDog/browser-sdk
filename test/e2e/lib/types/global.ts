import type { LogsGlobal } from '@datadog/browser-logs'
import type { RumGlobal } from '@datadog/browser-rum'

declare global {
  interface Window {
    DD_LOGS?: LogsGlobal
    DD_RUM?: RumGlobal
    DD_SOURCE_CODE_CONTEXT?: { [stack: string]: { service: string; version?: string } }
  }
}
