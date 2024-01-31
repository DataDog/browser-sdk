import { endsWith } from '../tools/utils/polyfills'
import { getGlobalObject } from '../tools/getGlobalObject'

export interface BrowserWindowWithEventBridge extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  getPrivacyLevel?(): string
  getAllowedWebViewHosts(): string
  send(msg: string): void
}

export function getEventBridge<T, E>() {
  const eventBridgeGlobal = getEventBridgeGlobal()

  if (!eventBridgeGlobal) {
    return
  }

  return {
    getPrivacyLevel() {
      return eventBridgeGlobal.getPrivacyLevel?.()
    },
    getAllowedWebViewHosts() {
      return JSON.parse(eventBridgeGlobal.getAllowedWebViewHosts()) as string[]
    },
    send(eventType: T, event: E, viewId?: string) {
      const view = viewId ? { id: viewId } : undefined
      eventBridgeGlobal.send(JSON.stringify({ eventType, event, view }))
    },
  }
}

export function isBridgeForRecordsSupported(): boolean {
  const bridge = getEventBridgeGlobal()
  return !!bridge && 'getPrivacyLevel' in bridge
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
