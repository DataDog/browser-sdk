import { DefaultPrivacyLevel } from '../../src/domain/configuration'
import type { BrowserWindowWithEventBridge } from '../../src/transport'
import { registerCleanupTask } from '../registerCleanupTask'

export function initEventBridgeStub({
  allowedWebViewHosts = [window.location.hostname],
  privacyLevel = DefaultPrivacyLevel.MASK,
}: { allowedWebViewHosts?: string[]; privacyLevel?: DefaultPrivacyLevel } = {}) {
  const eventBridgeStub = {
    send: (_msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
    getPrivacyLevel: () => privacyLevel,
  }
  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub

  registerCleanupTask(() => {
    delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
  })
  return eventBridgeStub
}
