import { setDebugMode } from '@datadog/browser-core'
import { startSessionManager } from '../domain/sessionManager'
import { trackPerformanceNavigationTimings } from '../domain/collection/trackPerformanceNavigationTimings'
import { startTransportManager } from '../domain/transportManager'
import { trackUrls } from '../domain/collection/trackUrls'
import { trackPerformanceResourceTimings } from '../domain/collection/trackPerformanceResourceTimings'
import { trackPerformanceEventTimings } from '../domain/collection/trackPerformanceEventTimings'
import { trackUncaughtErrors } from '../domain/collection/trackUncaughtErrors'
import { addError } from '../domain/collection/addError'
import { trackConsoleMethods } from '../domain/collection/trackConsoleMethods'
import { trackDDRumMethods } from '../domain/collection/trackDdRumMethods'
import { setContext } from '../domain/collection/setContext'
import { trackLongTasks } from '../domain/collection/trackLongTasks'

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
      trackConsoleMethods(transportManager),
      trackDDRumMethods(transportManager),
      trackLongTasks(transportManager)
    )
  }

  return {
    init,
    addError: addError.bind(null, transportManager),
    setGlobalContext: setContext.bind(null, transportManager, 'global'),
    setViewContext: setContext.bind(null, transportManager, 'view'),
    setUser: setContext.bind(null, transportManager, 'user'),
    setAccount: setContext.bind(null, transportManager, 'account'),
    stop: () => trackers.forEach((tracker) => tracker()),
    _setDebug: setDebugMode,
  }
}
