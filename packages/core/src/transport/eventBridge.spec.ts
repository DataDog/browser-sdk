import { initEventBridgeStub } from '../../test'
import { DefaultPrivacyLevel } from '../domain/configuration'
import type { DatadogEventBridge } from './eventBridge'
import { getEventBridge, canUseEventBridge, BridgeCapability, bridgeSupports } from './eventBridge'

describe('canUseEventBridge', () => {
  const allowedWebViewHosts = ['foo.bar']

  it('should detect when the bridge is present and the webView host is allowed', () => {
    initEventBridgeStub({ allowedWebViewHosts })
    expect(canUseEventBridge('foo.bar')).toBeTrue()
    expect(canUseEventBridge('baz.foo.bar')).toBeTrue()
    expect(canUseEventBridge('www.foo.bar')).toBeTrue()
    expect(canUseEventBridge('www.qux.foo.bar')).toBeTrue()
  })

  it('should not detect when the bridge is present and the webView host is not allowed', () => {
    initEventBridgeStub({ allowedWebViewHosts })
    expect(canUseEventBridge('foo.com')).toBeFalse()
    expect(canUseEventBridge('foo.bar.baz')).toBeFalse()
    expect(canUseEventBridge('bazfoo.bar')).toBeFalse()
  })

  it('should not detect when the bridge on the parent domain if only the subdomain is allowed', () => {
    initEventBridgeStub({ allowedWebViewHosts: ['baz.foo.bar'] })
    expect(canUseEventBridge('foo.bar')).toBeFalse()
  })

  it('should not detect when the bridge is absent', () => {
    expect(canUseEventBridge()).toBeFalse()
  })
})

describe('event bridge send', () => {
  let sendSpy: jasmine.Spy<(msg: string) => void>

  beforeEach(() => {
    const eventBridgeStub = initEventBridgeStub()
    sendSpy = spyOn(eventBridgeStub, 'send')
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

describe('event bridge getPrivacyLevel', () => {
  let eventBridgeStub: DatadogEventBridge
  const bridgePrivacyLevel = DefaultPrivacyLevel.MASK

  beforeEach(() => {
    eventBridgeStub = initEventBridgeStub({ privacyLevel: bridgePrivacyLevel })
  })

  it('should return the privacy level', () => {
    const eventBridge = getEventBridge()!

    expect(eventBridge.getPrivacyLevel()).toEqual(bridgePrivacyLevel)
  })

  it('should return undefined if getPrivacyLevel not present in the bridge', () => {
    delete eventBridgeStub.getPrivacyLevel
    const eventBridge = getEventBridge()!

    expect(eventBridge.getPrivacyLevel()).toBeUndefined()
  })

  describe('bridgeSupports', () => {
    it('should returns true when the bridge supports a capability', () => {
      initEventBridgeStub({ capabilities: [BridgeCapability.RECORDS] })
      expect(bridgeSupports(BridgeCapability.RECORDS)).toBeTrue()
    })

    it('should returns false when the bridge does not support a capability', () => {
      initEventBridgeStub({ capabilities: [] })
      expect(bridgeSupports(BridgeCapability.RECORDS)).toBeFalse()
    })
  })
})
