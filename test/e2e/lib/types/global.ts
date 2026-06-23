import type { DatadogLogs } from '@openobserve/browser-logs'
import type { DatadogDebugger } from '@openobserve/browser-debugger'
import type { DatadogRum } from '@openobserve/browser-rum'

declare global {
  interface Window {
    OO_LOGS?: DatadogLogs
    OO_RUM?: DatadogRum
    DD_DEBUGGER?: DatadogDebugger
    DD_SOURCE_CODE_CONTEXT?: { [stack: string]: { service: string; version?: string } }
  }
}
