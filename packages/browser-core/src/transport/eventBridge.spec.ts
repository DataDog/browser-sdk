import { mockEventBridge } from '../../test'
import { DefaultPrivacyLevel } from '../domain/configuration'
import type { BrowserWindowWithEventBridge } from './eventBridge'
import { getEventBridge, canUseEventBridge, BridgeCapability, bridgeSupports } from './eventBridge'

describe('canUseEventBridge', () => {
  const allowedWebViewHosts = ['foo.bar']

  it('should detect when the bridge is present and the webView host is allowed', () => {
    mockEventBridge({ allowedWebViewHosts })
    expect(canUseEventBridge('foo.bar')).toBeTrue()
    expect(canUseEventBridge('baz.foo.bar')).toBeTrue()
    expect(canUseEventBridge('www.foo.bar')).toBeTrue()
    expect(canUseEventBridge('www.qux.foo.bar')).toBeTrue()
  })

  it('should not detect when the bridge is present and the webView host is not allowed', () => {
    mockEventBridge({ allowedWebViewHosts })
    expect(canUseEventBridge('foo.com')).toBeFalse()
    expect(canUseEventBridge('foo.bar.baz')).toBeFalse()
    expect(canUseEventBridge('bazfoo.bar')).toBeFalse()
  })

  it('should not detect when the bridge on the parent domain if only the subdomain is allowed', () => {
    mockEventBridge({ allowedWebViewHosts: ['baz.foo.bar'] })
    expect(canUseEventBridge('foo.bar')).toBeFalse()
  })

  it('should not detect when the bridge is absent', () => {
    expect(canUseEventBridge()).toBeFalse()
  })
})

describe('canUseEventBridge with wildcard patterns', () => {
  it('should match a wildcard subdomain pattern', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['*.shopist.io'] })
    expect(canUseEventBridge('app.shopist.io')).toBeTrue()
    expect(canUseEventBridge('preview-abc.shopist.io')).toBeTrue()
  })

  it('should not match the apex domain with a wildcard subdomain pattern', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['*.shopist.io'] })
    expect(canUseEventBridge('shopist.io')).toBeFalse()
  })

  it('should match the apex domain with an exact pattern', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['shopist.io'] })
    expect(canUseEventBridge('shopist.io')).toBeTrue()
    expect(canUseEventBridge('app.shopist.io')).toBeFalse()
  })

  it('should match a prefix wildcard pattern', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['preview-*.shopist.io'] })
    expect(canUseEventBridge('preview-abc123.shopist.io')).toBeTrue()
    expect(canUseEventBridge('app.shopist.io')).toBeFalse()
  })

  it('should match across multiple patterns', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['shopist.io', '*.shopist.io'] })
    expect(canUseEventBridge('shopist.io')).toBeTrue()
    expect(canUseEventBridge('app.shopist.io')).toBeTrue()
  })

  it('should not match an unrelated host', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['*.shopist.io'] })
    expect(canUseEventBridge('evil.com')).toBeFalse()
  })

  it('should skip a pattern with more than one wildcard and still evaluate others', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['*.foo.*.bar', 'shopist.io'] })
    expect(canUseEventBridge('shopist.io')).toBeTrue()
    expect(canUseEventBridge('anything.foo.anything.bar')).toBeFalse()
  })

  it('should prefer wildcard path over legacy path when getAllowedWebViewHostPatterns is present', () => {
    mockEventBridge({ allowedWebViewHosts: ['legacy.com'], allowedWebViewHostPatterns: ['shopist.io'] })
    expect(canUseEventBridge('shopist.io')).toBeTrue()
    expect(canUseEventBridge('legacy.com')).toBeFalse()
  })

  it('should not detect when bridge is absent', () => {
    expect(canUseEventBridge('shopist.io')).toBeFalse()
  })
})

describe('event bridge send', () => {
  let sendSpy: jasmine.Spy<(msg: string) => void>

  beforeEach(() => {
    const eventBridge = mockEventBridge()
    sendSpy = spyOn(eventBridge, 'send')
  })

  it('should serialize sent events without view', () => {
    const eventBridge = getEventBridge()!

    eventBridge.send('view', { foo: 'bar' })

    expect(sendSpy).toHaveBeenCalledOnceWith('{"eventType":"view","event":{"foo":"bar"}}')
  })

  it('should serialize sent events with view', () => {
    const eventBridge = getEventBridge()!

    eventBridge.send('view', { foo: 'bar' }, '123')

    expect(sendSpy).toHaveBeenCalledOnceWith('{"eventType":"view","event":{"foo":"bar"},"view":{"id":"123"}}')
  })
})

describe('event bridge getIsTraceSampled', () => {
  it("should return true when the bridge returns 'true'", () => {
    mockEventBridge({ isTraceSampled: true })
    const eventBridge = getEventBridge()!

    expect(eventBridge.getIsTraceSampled()).toBeTrue()
  })

  it("should return false when the bridge returns 'false'", () => {
    mockEventBridge({ isTraceSampled: false })
    const eventBridge = getEventBridge()!

    expect(eventBridge.getIsTraceSampled()).toBeFalse()
  })

  it("should return null when the bridge returns 'null'", () => {
    mockEventBridge()
    ;(window as BrowserWindowWithEventBridge).DatadogEventBridge!.getIsTraceSampled = () => 'null'
    const eventBridge = getEventBridge()!

    expect(eventBridge.getIsTraceSampled()).toBeNull()
  })

  it('should return null when getIsTraceSampled is not present on the bridge', () => {
    mockEventBridge()
    const eventBridge = getEventBridge()!

    expect(eventBridge.getIsTraceSampled()).toBeNull()
  })
})

describe('event bridge getPrivacyLevel', () => {
  const bridgePrivacyLevel = DefaultPrivacyLevel.MASK

  beforeEach(() => {
    mockEventBridge({ privacyLevel: bridgePrivacyLevel })
  })

  it('should return the privacy level', () => {
    const eventBridge = getEventBridge()!

    expect(eventBridge.getPrivacyLevel()).toEqual(bridgePrivacyLevel)
  })

  it('should return undefined if getPrivacyLevel not present in the bridge', () => {
    delete (window as BrowserWindowWithEventBridge).DatadogEventBridge?.getPrivacyLevel
    const eventBridge = getEventBridge()!

    expect(eventBridge.getPrivacyLevel()).toBeUndefined()
  })

  describe('bridgeSupports', () => {
    it('should returns true when the bridge supports a capability', () => {
      mockEventBridge({ capabilities: [BridgeCapability.RECORDS] })
      expect(bridgeSupports(BridgeCapability.RECORDS)).toBeTrue()
    })

    it('should returns false when the bridge does not support a capability', () => {
      mockEventBridge({ capabilities: [] })
      expect(bridgeSupports(BridgeCapability.RECORDS)).toBeFalse()
    })
  })
})
