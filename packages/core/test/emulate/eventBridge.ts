import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import type { BrowserWindowWithEventBridge, DatadogEventBridge } from '../../src/transport'
import { registerCleanupTask } from '../registerCleanupTask'

export function initEventBridgeStub({
  allowedWebViewHosts = [window.location.hostname],
  privacyLevel = DefaultPrivacyLevel.MASK,
  bridgeForRecordsSupported = true,
}: { allowedWebViewHosts?: string[]; privacyLevel?: DefaultPrivacyLevel; bridgeForRecordsSupported?: boolean } = {}) {
  const eventBridgeStub: DatadogEventBridge = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
  }
  if (bridgeForRecordsSupported) {
    eventBridgeStub.getPrivacyLevel = () => privacyLevel
  }

  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub

  registerCleanupTask(() => {
    delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
  })
  return eventBridgeStub
}
