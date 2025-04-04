import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import { BridgeCapability, GlobalWithEventBridge } from '../../src/transport'
import type { DatadogEventBridge } from '../../src/transport'
import { registerCleanupTask } from '../registerCleanupTask'

export function mockEventBridge({
  allowedWebViewHosts = [window.location.hostname],
  privacyLevel = DefaultPrivacyLevel.MASK,
  capabilities = [BridgeCapability.RECORDS],
}: { allowedWebViewHosts?: string[]; privacyLevel?: DefaultPrivacyLevel; capabilities?: BridgeCapability[] } = {}) {
  const eventBridge: DatadogEventBridge = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    getCapabilities: () => JSON.stringify(capabilities),
    getPrivacyLevel: () => privacyLevel,
  }

  ;(window as GlobalWithEventBridge).DatadogEventBridge = eventBridge

  registerCleanupTask(() => {
    delete (window as GlobalWithEventBridge).DatadogEventBridge
  })
  return eventBridge
}
