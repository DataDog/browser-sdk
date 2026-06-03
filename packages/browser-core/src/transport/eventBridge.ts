import { globalObject } from '../tools/globalObject'
import type { DefaultPrivacyLevel } from '../domain/configuration'

export interface BrowserWindowWithEventBridge {
  DatadogEventBridge?: DatadogEventBridge
}

export interface DatadogEventBridge {
  getCapabilities?(): string
  getPrivacyLevel?(): DefaultPrivacyLevel
  getIsTraceSampled?(): 'true' | 'false' | 'null'
  getAllowedWebViewHosts(): string
  getAllowedWebViewHostPatterns?(): string
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
    getIsTraceSampled() {
      return JSON.parse(eventBridgeGlobal.getIsTraceSampled?.() || 'null') as boolean | null
    },
    getAllowedWebViewHosts() {
      return JSON.parse(eventBridgeGlobal.getAllowedWebViewHosts()) as string[]
    },
    getAllowedWebViewHostPatterns() {
      return JSON.parse(eventBridgeGlobal.getAllowedWebViewHostPatterns?.() || '[]') as string[]
    },
    send(eventType: T, event: E, viewId?: string) {
      const view = viewId ? { id: viewId } : undefined
      eventBridgeGlobal.send(JSON.stringify({ eventType, event, view }))
    },
  }
}

export function bridgeSupports(capability: BridgeCapability): boolean {
  const bridge = getEventBridge()
  return !!bridge && bridge.getCapabilities().includes(capability)
}

export function canUseEventBridge(currentHost = globalObject.location?.hostname): boolean {
  const bridge = getEventBridge()

  if (typeof getEventBridgeGlobal()?.getAllowedWebViewHostPatterns === 'function') {
    return (
      bridge?.getAllowedWebViewHostPatterns().some((pattern) => matchesWildcardPattern(currentHost, pattern)) ?? false
    )
  }

  return (
    bridge
      ?.getAllowedWebViewHosts()
      .some((allowedHost) => currentHost === allowedHost || currentHost.endsWith(`.${allowedHost}`)) ?? false
  )
}

export function matchesWildcardPattern(host: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return host === pattern
  }
  const parts = pattern.split('*')
  if (parts.length !== 2) {
    return false
  }
  const [prefix, suffix] = parts
  return host.length >= prefix.length + suffix.length && host.startsWith(prefix) && host.endsWith(suffix)
}

function getEventBridgeGlobal() {
  return (globalObject as BrowserWindowWithEventBridge).DatadogEventBridge
}
