import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import { BridgeCapability } from '../../src/transport'
import type { BrowserWindowWithEventBridge, DatadogEventBridge } from '../../src/transport'
import { registerCleanupTask } from '../registerCleanupTask'

export function mockEventBridge({
  allowedWebViewHosts = [window.location.hostname],
  allowedWebViewHostPatterns,
  privacyLevel = DefaultPrivacyLevel.MASK,
  capabilities = [BridgeCapability.RECORDS],
  isTraceSampled,
}: {
  allowedWebViewHosts?: string[]
  allowedWebViewHostPatterns?: string[]
  privacyLevel?: DefaultPrivacyLevel
  capabilities?: BridgeCapability[]
  isTraceSampled?: boolean
} = {}) {
  const eventBridge: DatadogEventBridge = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    getAllowedWebViewHostPatterns:
      allowedWebViewHostPatterns !== undefined ? () => JSON.stringify(allowedWebViewHostPatterns) : undefined,
    getCapabilities: () => JSON.stringify(capabilities),
    getPrivacyLevel: () => privacyLevel,
    getIsTraceSampled: isTraceSampled !== undefined ? () => String(isTraceSampled) as 'true' | 'false' : undefined,
  }

  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridge

  registerCleanupTask(() => {
    delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
  })
  return eventBridge
}
