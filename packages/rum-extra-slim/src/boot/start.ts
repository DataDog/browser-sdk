import { setDebugMode } from '@datadog/browser-core'
import { startSessionManager } from '../domain/sessionManager'
import { trackPerformanceNavigationTimings } from '../domain/collection/trackPerformanceNavigationTimings'
import { startTransportManager } from '../domain/transportManager'
import { trackUrls } from '../domain/collection/trackUrls'
import { trackPerformanceResourceTimings } from '../domain/collection/trackPerformanceResourceTimings'
import { trackPerformanceEventTimings } from '../domain/collection/trackPerformanceEventTimings'

export function start() {
  const sessionManager = startSessionManager()
  const transportManager = startTransportManager(sessionManager)

  const trackers: Array<() => void> = []

  function init() {
    trackers.push(
      trackUrls(transportManager),
      trackPerformanceResourceTimings(transportManager),
      trackPerformanceNavigationTimings(transportManager),
      trackPerformanceEventTimings(transportManager)
    )
  }

  return {
    init,
    stop: () => trackers.forEach((tracker) => tracker()),
    _setDebug: setDebugMode,
  }
}
