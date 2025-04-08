import { startSessionManager } from '../domain/sessionManager'
import { trackNavigationTimings } from '../domain/collection/trackNavigationTimings'
import { startTransportManager } from '../domain/transportManager'
import { trackUrlChange } from '../domain/collection/trackUrls'

export function start() {
  const sessionManager = startSessionManager()
  const transportManager = startTransportManager(sessionManager)

  function init() {
    trackUrlChange(transportManager)
    trackNavigationTimings(transportManager)
  }

  return {
    init,
  }
}
