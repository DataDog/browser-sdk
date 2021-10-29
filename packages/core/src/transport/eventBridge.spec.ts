import { resetExperimentalFeatures, updateExperimentalFeatures } from '..'
import { deleteDatadogEventBridgeStub, initDatadogEventBridgeStub } from '../../test/specHelper'
import { DatadogEventBridge, getEventBridge, isEventBridgePresent } from './eventBridge'

describe('isEventBridgePresent', () => {
  afterEach(() => {
    resetExperimentalFeatures()
    deleteDatadogEventBridgeStub()
  })

  describe('when ff enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['event-bridge'])
    })

    it('should detect when the bridge is present', () => {
      initDatadogEventBridgeStub()
      expect(isEventBridgePresent()).toBeTrue()
    })

    it('should not detect when the bridge is absent', () => {
      expect(isEventBridgePresent()).toBeFalse()
    })
  })

  describe('when ff disabled', () => {
    it('should not detect when the bridge is present', () => {
      initDatadogEventBridgeStub()
      expect(isEventBridgePresent()).toBeFalse()
    })
    it('should not detect when the bridge is absent', () => {
      expect(isEventBridgePresent()).toBeFalse()
    })
  })
})

describe('getEventBridge', () => {
  let eventBridgeStub: DatadogEventBridge

  beforeEach(() => {
    updateExperimentalFeatures(['event-bridge'])
    eventBridgeStub = initDatadogEventBridgeStub()
  })

  afterEach(() => {
    resetExperimentalFeatures()
    deleteDatadogEventBridgeStub()
  })

  it('should serialize the event for the datadog bridge', () => {
    const sendSpy = spyOn(eventBridgeStub, 'send')
    const bridge = getEventBridge()
    const event = { foo: 'bar' }
    const eventType = 'view'

    bridge.send(eventType, event)

    expect(sendSpy).toHaveBeenCalledOnceWith(JSON.stringify({ eventType, event }))
  })
})
