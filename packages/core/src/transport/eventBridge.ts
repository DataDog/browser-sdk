import { getGlobalObject } from '../tools/getGlobalObject'
import type { DefaultPrivacyLevel } from '../domain/configuration'

export interface DatadogEventBridge {
  getCapabilities?(): string
  getPrivacyLevel?(): DefaultPrivacyLevel
  getAllowedWebViewHosts(): string
  send(msg: string): void
}

export const enum BridgeCapability {
  RECORDS = 'records',
}

/**
 * Returns an object to interact with the event bridge, if available.
 */
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

/**
 * Checks if the event bridge supports a given capability.
 */
export function bridgeSupports(capability: BridgeCapability): boolean {
  const bridge = getEventBridge()
  return !!bridge && bridge.getCapabilities().includes(capability)
}

/**
 * Returns true if the event bridge is available and the current host is allowed.
 * In a Service Worker context, self.location is used instead of window.location.
 */
export function canUseEventBridge(currentHost?: string): boolean {
  if (!currentHost) {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      currentHost = window.location.hostname
    } else if (typeof self !== 'undefined' && self.location && self.location.hostname) {
      currentHost = self.location.hostname
    } else {
      currentHost = ''
    }
  }
  const bridge = getEventBridge()
  return (
    !!bridge &&
    bridge
      .getAllowedWebViewHosts()
      .some((allowedHost) => currentHost === allowedHost || currentHost.endsWith(`.${allowedHost}`))
  )
}

/**
 * We define a generic global interface so that getGlobalObject works in both
 * browser and Service Worker contexts.
 */
export interface GlobalWithEventBridge {
  DatadogEventBridge?: DatadogEventBridge
}

/**
 * Retrieves the global DatadogEventBridge, whether on window or in a Service Worker.
 */
function getEventBridgeGlobal() {
  const globalObject = getGlobalObject<GlobalWithEventBridge>()
  return globalObject.DatadogEventBridge
}
