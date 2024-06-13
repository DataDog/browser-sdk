import { endsWith, includes } from '../tools/utils/polyfills'
import { getGlobalObject } from '../tools/getGlobalObject'
import type { DefaultPrivacyLevel } from '../domain/configuration'

export interface BrowserWindowWithEventBridge extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  getCapabilities?(): string
  getPrivacyLevel?(): DefaultPrivacyLevel
  getAllowedWebViewHosts(): string
  send(msg: string): void
}

export const enum BridgeCapability {
  RECORDS = 'records',
}

export function getEventBridge<T, E>() {
  const eventBridgeGlobal = getEventBridgeGlobal()

  if (!eventBridgeGlobal) {
    return
  }

  return {
    getCapabilities() {
      return JSON.parse(eventBridgeGlobal.getCapabilities?.() || '[]') as BridgeCapability[]
    },
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

export function bridgeSupports(capability: BridgeCapability): boolean {
  const bridge = getEventBridge()
  return !!bridge && includes(bridge.getCapabilities(), capability)
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
