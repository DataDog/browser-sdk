import { resetExperimentalFeatures, updateExperimentalFeatures } from '..'
import { deleteEventBridgeStub, initEventBridgeStub } from '../../test/specHelper'
import { getEventBridge, canUseEventBridge } from './eventBridge'

describe('canUseEventBridge', () => {
  const allowedWebViewHosts = ['foo.bar']

  afterEach(() => {
    resetExperimentalFeatures()
    deleteEventBridgeStub()
  })

  describe('when ff enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['event-bridge'])
    })

    it('should detect when the bridge is present and the webView host is allowed', () => {
      initEventBridgeStub()
      expect(canUseEventBridge()).toBeTrue()
    })

    it('should not detect when the bridge is absent', () => {
      expect(canUseEventBridge()).toBeFalse()
    })

    it('should not detect when the bridge is present and the webView host is not allowed', () => {
      initEventBridgeStub(allowedWebViewHosts)
      expect(canUseEventBridge()).toBeFalse()
    })
  })

  describe('when ff disabled', () => {
    it('should not detect when the bridge is present and the webView host is allowed', () => {
      initEventBridgeStub()
      expect(canUseEventBridge()).toBeFalse()
    })

    it('should not detect when the bridge is present and the webView host is not allowed', () => {
      initEventBridgeStub(allowedWebViewHosts)
      expect(canUseEventBridge()).toBeFalse()
    })

    it('should not detect when the bridge is absent', () => {
      expect(canUseEventBridge()).toBeFalse()
    })
  })
})

describe('getEventBridge', () => {
  let sendSpy: jasmine.Spy<(msg: string) => void>

  beforeEach(() => {
    updateExperimentalFeatures(['event-bridge'])
    const eventBridgeStub = initEventBridgeStub()
    sendSpy = spyOn(eventBridgeStub, 'send')
  })

  afterEach(() => {
    resetExperimentalFeatures()
    deleteEventBridgeStub()
  })

  it('event bridge should serialize sent events', () => {
    const eventBridge = getEventBridge()!

    eventBridge.send('view', { foo: 'bar' })

    expect(sendSpy).toHaveBeenCalledOnceWith('{"eventType":"view","event":{"foo":"bar"}}')
  })
})
