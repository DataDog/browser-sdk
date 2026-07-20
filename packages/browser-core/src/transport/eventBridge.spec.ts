import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { mockEventBridge } from '../../test'
import { display } from '../tools/display'
import { DefaultPrivacyLevel } from '../domain/configuration'
import type { BrowserWindowWithEventBridge } from './eventBridge'
import { getEventBridge, canUseEventBridge, matchesHostEntry, BridgeCapability, bridgeSupports } from './eventBridge'

describe('canUseEventBridge', () => {
  const allowedWebViewHosts = ['foo.bar']

  it('should detect when the bridge is present and the webView host is allowed', () => {
    mockEventBridge({ allowedWebViewHosts })
    expect(canUseEventBridge('foo.bar')).toBe(true)
    expect(canUseEventBridge('baz.foo.bar')).toBe(true)
    expect(canUseEventBridge('www.foo.bar')).toBe(true)
    expect(canUseEventBridge('www.qux.foo.bar')).toBe(true)
  })

  it('should not detect when the bridge is present and the webView host is not allowed', () => {
    mockEventBridge({ allowedWebViewHosts })
    expect(canUseEventBridge('foo.com')).toBe(false)
    expect(canUseEventBridge('foo.bar.baz')).toBe(false)
    expect(canUseEventBridge('bazfoo.bar')).toBe(false)
  })

  it('should not detect when the bridge on the parent domain if only the subdomain is allowed', () => {
    mockEventBridge({ allowedWebViewHosts: ['baz.foo.bar'] })
    expect(canUseEventBridge('foo.bar')).toBe(false)
  })

  it('should not detect when the bridge is absent', () => {
    expect(canUseEventBridge()).toBe(false)
  })
})

describe('matchesHostEntry', () => {
  beforeEach(() => {
    vi.spyOn(display, 'error').mockImplementation(() => undefined)
  })

  // prettier-ignore
  const cases: Array<[string, string, boolean]> = [
    // [host,                          pattern,                  expected]
    ['app.shopist.io',                 '*.shopist.io',           true],
    ['preview-abc.shopist.io',         '*.shopist.io',           true],
    ['shopist.io',                     '*.shopist.io',           false], // apex not matched by subdomain wildcard
    ['shopist.io',                     'shopist.io',             true],  // exact match
    ['app.shopist.io',                 'shopist.io',             true],  // subdomain-suffix match
    ['preview-abc123.shopist.io',      'preview-*.shopist.io',   true],
    ['app.shopist.io',                 'preview-*.shopist.io',   false],
    ['evil.com',                       '*.shopist.io',           false],
    ['app.shopist.io.evil.com',        '*.shopist.io',           false],
    ['anything.foo.anything.bar',      '*.foo.*.bar',            false], // multiple wildcards → invalid
    ['preview-.shopist.io',            'preview-*.shopist.io',   false], // wildcard must match at least one character
    ['.shopist.io',                    '*.shopist.io',           false], // wildcard must match at least one character
    ['app.shopist.io',                 '*',                      true],  // bare "*" matches any host
    ['shopist.io',                     '*',                      true],  // bare "*" matches any host
  ]

  cases.forEach(([host, pattern, expected]) => {
    it(`"${host}" against "${pattern}" → ${expected}`, () => {
      expect(matchesHostEntry(host, pattern)).toBe(expected)
    })
  })
})

describe('canUseEventBridge with wildcard patterns', () => {
  it('should match wildcard entries in getAllowedWebViewHosts', () => {
    mockEventBridge({ allowedWebViewHosts: ['*.shopist.io', 'shopist.io'] })
    expect(canUseEventBridge('app.shopist.io')).toBe(true)
    expect(canUseEventBridge('shopist.io')).toBe(true)
    expect(canUseEventBridge('evil.com')).toBe(false)
  })

  it('should match plain and wildcard entries together', () => {
    mockEventBridge({ allowedWebViewHosts: ['legacy.com', '*.shopist.io'] })
    expect(canUseEventBridge('legacy.com')).toBe(true)
    expect(canUseEventBridge('app.shopist.io')).toBe(true)
    expect(canUseEventBridge('evil.com')).toBe(false)
  })

  it('should log an error and skip patterns with more than one wildcard', () => {
    const displayErrorSpy = vi.spyOn(display, 'error').mockImplementation(() => undefined)
    mockEventBridge({ allowedWebViewHosts: ['*.foo.*.bar', 'shopist.io'] })
    expect(canUseEventBridge('shopist.io')).toBe(true)
    expect(canUseEventBridge('anything.foo.anything.bar')).toBe(false)
    expect(displayErrorSpy).toHaveBeenCalledWith(
      'Invalid WebView host pattern "*.foo.*.bar": only one wildcard (*) is supported.'
    )
  })

  it('should not detect when bridge is absent', () => {
    expect(canUseEventBridge('shopist.io')).toBe(false)
  })
})

describe('event bridge send', () => {
  let sendSpy: Mock<(msg: string) => void>

  beforeEach(() => {
    const eventBridge = mockEventBridge()
    sendSpy = vi.spyOn(eventBridge, 'send').mockImplementation(() => undefined)
  })

  it('should serialize sent events without view', () => {
    const eventBridge = getEventBridge()!

    eventBridge.send('view', { foo: 'bar' })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledExactlyOnceWith('{"eventType":"view","event":{"foo":"bar"}}')
  })

  it('should serialize sent events with view', () => {
    const eventBridge = getEventBridge()!

    eventBridge.send('view', { foo: 'bar' }, '123')

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledExactlyOnceWith('{"eventType":"view","event":{"foo":"bar"},"view":{"id":"123"}}')
  })
})

describe('event bridge getIsTraceSampled', () => {
  it("should return true when the bridge returns 'true'", () => {
    mockEventBridge({ isTraceSampled: true })
    const eventBridge = getEventBridge()!

    expect(eventBridge.getIsTraceSampled()).toBe(true)
  })

  it("should return false when the bridge returns 'false'", () => {
    mockEventBridge({ isTraceSampled: false })
    const eventBridge = getEventBridge()!

    expect(eventBridge.getIsTraceSampled()).toBe(false)
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
      expect(bridgeSupports(BridgeCapability.RECORDS)).toBe(true)
    })

    it('should returns false when the bridge does not support a capability', () => {
      mockEventBridge({ capabilities: [] })
      expect(bridgeSupports(BridgeCapability.RECORDS)).toBe(false)
    })
  })
})
