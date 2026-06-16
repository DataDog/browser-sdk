/* eslint-disable local-rules/disallow-side-effects */
import { createMonitor } from '@datadog/js-core/monitor'
import { setDebugMode } from '@datadog/js-core/util'
import { display } from './display'

// The error-collection callback is wired lazily (via `startMonitorErrorCollection`, during telemetry
// init), so we pass a stable forwarding function to `createMonitor` and keep the real callback in a
// mutable holder.
let onMonitorErrorCollected: ((error: unknown) => void) | undefined

const { monitored, monitor, callMonitored, monitorError } = createMonitor(display, (error) =>
  onMonitorErrorCollected?.(error)
)

export { monitored, monitor, callMonitored, monitorError }

export function startMonitorErrorCollection(newOnMonitorErrorCollected: (error: unknown) => void) {
  onMonitorErrorCollected = newOnMonitorErrorCollected
}

export function resetMonitor() {
  onMonitorErrorCollected = undefined
  setDebugMode(false)
}
