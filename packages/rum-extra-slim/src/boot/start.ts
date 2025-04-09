import { setDebugMode } from '@datadog/browser-core'
import { startSessionManager } from '../domain/sessionManager'
import { trackPerformanceNavigationTimings } from '../domain/collection/trackPerformanceNavigationTimings'
import { startTransportManager } from '../domain/transportManager'
import { trackUrlChange } from '../domain/collection/trackUrls'
import { trackPerformanceResourceTimings } from '../domain/collection/trackPerformanceResourceTimings'

export function start() {
  const sessionManager = startSessionManager()
  const transportManager = startTransportManager(sessionManager)

  const trackers: Array<() => void> = []

  function init() {
    trackers.push(
      trackUrlChange(transportManager),
      trackPerformanceResourceTimings(transportManager),
      trackPerformanceNavigationTimings(transportManager)
    )
  }

  return {
    init,
    stop: () => trackers.forEach((tracker) => tracker()),
    _setDebug: setDebugMode,
  }
}
