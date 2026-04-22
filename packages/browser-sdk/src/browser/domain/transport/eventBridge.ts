interface DatadogEventBridge {
  getCapabilities?(): string
  getAllowedWebViewHosts(): string
  send(msg: string): void
}

const enum BridgeCapability {
  RECORDS = 'records',
}

function getEventBridge(): DatadogEventBridge | undefined {
  const bridge = (window as any).DatadogEventBridge as DatadogEventBridge | undefined
  return bridge
}

function canUseEventBridge(currentHost?: string): boolean {
  const bridge = getEventBridge()
  if (!bridge) {
    return false
  }
  try {
    const allowedHosts: string[] = JSON.parse(bridge.getAllowedWebViewHosts())
    const host = currentHost ?? window.location.hostname
    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

function bridgeSupports(capability: BridgeCapability): boolean {
  const bridge = getEventBridge()
  if (!bridge?.getCapabilities) {
    return false
  }
  try {
    const capabilities: string[] = JSON.parse(bridge.getCapabilities())
    return capabilities.includes(capability)
  } catch {
    return false
  }
}

export type { DatadogEventBridge }
export { BridgeCapability, getEventBridge, canUseEventBridge, bridgeSupports }
