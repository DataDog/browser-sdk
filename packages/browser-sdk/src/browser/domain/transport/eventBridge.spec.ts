import { BridgeCapability, bridgeSupports, canUseEventBridge, getEventBridge } from './eventBridge'

describe('getEventBridge', () => {
  afterEach(() => {
    delete (window as any).DatadogEventBridge
  })

  it('returns undefined when window.DatadogEventBridge does not exist', () => {
    expect(getEventBridge()).toBeUndefined()
  })

  it('returns the bridge when window.DatadogEventBridge exists', () => {
    const bridge = {
      getAllowedWebViewHosts: () => '[]',
      send: (_msg: string) => {},
    }
    ;(window as any).DatadogEventBridge = bridge

    expect(getEventBridge()).toBe(bridge)
  })
})

describe('canUseEventBridge', () => {
  afterEach(() => {
    delete (window as any).DatadogEventBridge
  })

  it('returns false when no bridge is present', () => {
    expect(canUseEventBridge('foo.bar')).toBeFalse()
  })

  it('returns true when current host is in the allowed list', () => {
    ;(window as any).DatadogEventBridge = {
      getAllowedWebViewHosts: () => JSON.stringify(['foo.bar']),
      send: (_msg: string) => {},
    }

    expect(canUseEventBridge('foo.bar')).toBeTrue()
  })

  it('returns true for a subdomain of an allowed host', () => {
    ;(window as any).DatadogEventBridge = {
      getAllowedWebViewHosts: () => JSON.stringify(['foo.bar']),
      send: (_msg: string) => {},
    }

    expect(canUseEventBridge('sub.foo.bar')).toBeTrue()
  })

  it('returns false when host is not in the allowed list', () => {
    ;(window as any).DatadogEventBridge = {
      getAllowedWebViewHosts: () => JSON.stringify(['foo.bar']),
      send: (_msg: string) => {},
    }

    expect(canUseEventBridge('other.com')).toBeFalse()
  })
})

describe('bridgeSupports', () => {
  afterEach(() => {
    delete (window as any).DatadogEventBridge
  })

  it('returns false when no bridge is present', () => {
    expect(bridgeSupports(BridgeCapability.RECORDS)).toBeFalse()
  })

  it('returns true when the capability is listed', () => {
    ;(window as any).DatadogEventBridge = {
      getCapabilities: () => JSON.stringify([BridgeCapability.RECORDS]),
      getAllowedWebViewHosts: () => '[]',
      send: (_msg: string) => {},
    }

    expect(bridgeSupports(BridgeCapability.RECORDS)).toBeTrue()
  })

  it('returns false when the capability is not listed', () => {
    ;(window as any).DatadogEventBridge = {
      getCapabilities: () => JSON.stringify([]),
      getAllowedWebViewHosts: () => '[]',
      send: (_msg: string) => {},
    }

    expect(bridgeSupports(BridgeCapability.RECORDS)).toBeFalse()
  })

  it('returns false when getCapabilities is not defined on the bridge', () => {
    ;(window as any).DatadogEventBridge = {
      getAllowedWebViewHosts: () => '[]',
      send: (_msg: string) => {},
    }

    expect(bridgeSupports(BridgeCapability.RECORDS)).toBeFalse()
  })
})
