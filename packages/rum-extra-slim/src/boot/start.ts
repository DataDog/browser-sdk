import { instrumentMethod, setDebugMode } from '@datadog/browser-core'
import { startSessionManager } from '../domain/sessionManager'
import { trackPerformanceNavigationTimings } from '../domain/collection/trackPerformanceNavigationTimings'
import { startTransportManager } from '../domain/transportManager'
import { trackUrls } from '../domain/collection/trackUrls'
import { trackPerformanceResourceTimings } from '../domain/collection/trackPerformanceResourceTimings'
import { trackPerformanceEventTimings } from '../domain/collection/trackPerformanceEventTimings'
import { trackUncaughtErrors } from '../domain/collection/trackUncaughtErrors'
import { addError } from '../domain/collection/addError'
import { trackConsoleMethods } from '../domain/collection/trackConsoleMethods'

export function start() {
  const sessionManager = startSessionManager()
  const transportManager = startTransportManager(sessionManager)

  const trackers: Array<() => void> = []

  function init() {
    trackers.push(
      trackUrls(transportManager),
      trackUncaughtErrors(transportManager),
      trackPerformanceResourceTimings(transportManager),
      trackPerformanceNavigationTimings(transportManager),
      trackPerformanceEventTimings(transportManager),
      trackConsoleMethods(transportManager)
    )
  }

  // reroute DD_RUM methods to the extra slim sdk
  if ('DD_RUM' in window) {
    instrumentMethod(window.DD_RUM as any, 'addError', ({ parameters }) =>
      addError(transportManager, parameters[0], parameters[1])
    )
  }

  return {
    init,
    addError: addError.bind(null, transportManager),
    stop: () => trackers.forEach((tracker) => tracker()),
    _setDebug: setDebugMode,
  }
}
