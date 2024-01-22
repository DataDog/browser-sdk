import { PRIVACY_LEVEL_FROM_EVENT_BRIDGE, deleteEventBridgeStub, initEventBridgeStub } from '../../test'
import type { DatadogEventBridge } from './eventBridge'
import { getEventBridge, canUseEventBridge } from './eventBridge'

describe('canUseEventBridge', () => {
  const allowedWebViewHosts = ['foo.bar']

  afterEach(() => {
    deleteEventBridgeStub()
  })

  it('should detect when the bridge is present and the webView host is allowed', () => {
    initEventBridgeStub(allowedWebViewHosts)
    expect(canUseEventBridge('foo.bar')).toBeTrue()
    expect(canUseEventBridge('baz.foo.bar')).toBeTrue()
    expect(canUseEventBridge('www.foo.bar')).toBeTrue()
    expect(canUseEventBridge('www.qux.foo.bar')).toBeTrue()
  })

  it('should not detect when the bridge is present and the webView host is not allowed', () => {
    initEventBridgeStub(allowedWebViewHosts)
    expect(canUseEventBridge('foo.com')).toBeFalse()
    expect(canUseEventBridge('foo.bar.baz')).toBeFalse()
    expect(canUseEventBridge('bazfoo.bar')).toBeFalse()
  })

  it('should not detect when the bridge on the parent domain if only the subdomain is allowed', () => {
    initEventBridgeStub(['baz.foo.bar'])
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

  afterEach(() => {
    deleteEventBridgeStub()
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

  beforeEach(() => {
    eventBridgeStub = initEventBridgeStub()
  })

  afterEach(() => {
    deleteEventBridgeStub()
  })

  it('should return the privacy level', () => {
    const eventBridge = getEventBridge()!

    expect(eventBridge.getPrivacyLevel()).toEqual(PRIVACY_LEVEL_FROM_EVENT_BRIDGE)
  })

  it('should return undefined if getPrivacyLevel not present in the bridge', () => {
    delete eventBridgeStub.getPrivacyLevel
    const eventBridge = getEventBridge()!

    expect(eventBridge.getPrivacyLevel()).toBeUndefined()
  })
})
