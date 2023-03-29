import { endsWith, getGlobalObject } from '../tools/utils'

export interface BrowserWindowWithEventBridge extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  getAllowedWebViewHosts(): string
  send(msg: string): void
}

export function getEventBridge<T, E>() {
  const eventBridgeGlobal = getEventBridgeGlobal()

  if (!eventBridgeGlobal) {
    return
  }

  return {
    getAllowedWebViewHosts() {
      return JSON.parse(eventBridgeGlobal.getAllowedWebViewHosts()) as string[]
    },
    send(eventType: T, event: E) {
      eventBridgeGlobal.send(JSON.stringify({ eventType, event }))
    },
  }
}

export function canUseEventBridge(currentHost = getGlobalObject<Window>().location?.hostname): boolean {
  const bridge = getEventBridge()
  return (
    !!bridge &&
    bridge
      .getAllowedWebViewHosts()
      .some((allowedHost) => currentHost === allowedHost || endsWith(currentHost, `.${allowedHost}`))
  )
}

function getEventBridgeGlobal() {
  return getGlobalObject<BrowserWindowWithEventBridge>().DatadogEventBridge
}
