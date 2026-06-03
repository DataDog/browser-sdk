import { mockEventBridge } from '../../test'
import { DefaultPrivacyLevel } from '../domain/configuration'
import type { BrowserWindowWithEventBridge } from './eventBridge'
import {
  getEventBridge,
  canUseEventBridge,
  matchesWildcardPattern,
  BridgeCapability,
  bridgeSupports,
} from './eventBridge'

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

describe('matchesWildcardPattern', () => {
  // prettier-ignore
  const cases: Array<[string, string, boolean]> = [
    // [host,                          pattern,                  expected]
    ['app.shopist.io',                 '*.shopist.io',           true],
    ['preview-abc.shopist.io',         '*.shopist.io',           true],
    ['shopist.io',                     '*.shopist.io',           false], // apex not matched by subdomain wildcard
    ['shopist.io',                     'shopist.io',             true],  // exact match
    ['app.shopist.io',                 'shopist.io',             false], // exact only, no subdomain
    ['preview-abc123.shopist.io',      'preview-*.shopist.io',   true],
    ['app.shopist.io',                 'preview-*.shopist.io',   false],
    ['evil.com',                       '*.shopist.io',           false],
    ['anything.foo.anything.bar',      '*.foo.*.bar',            false], // multiple wildcards → invalid
  ]

  cases.forEach(([host, pattern, expected]) => {
    it(`"${host}" against "${pattern}" → ${expected}`, () => {
      expect(matchesWildcardPattern(host, pattern)).toBe(expected)
    })
  })
})

describe('canUseEventBridge with wildcard patterns', () => {
  it('should use wildcard matching when getAllowedWebViewHostPatterns is present', () => {
    mockEventBridge({ allowedWebViewHostPatterns: ['*.shopist.io', 'shopist.io'] })
    expect(canUseEventBridge('app.shopist.io')).toBeTrue()
    expect(canUseEventBridge('shopist.io')).toBeTrue()
    expect(canUseEventBridge('evil.com')).toBeFalse()
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
