import { resetExperimentalFeatures, updateExperimentalFeatures } from '..'
import { deleteEventBridgeStub, initEventBridgeStub } from '../../test/specHelper'
import { getEventBridge, isEventBridgePresent } from './eventBridge'

describe('isEventBridgePresent', () => {
  afterEach(() => {
    resetExperimentalFeatures()
    deleteEventBridgeStub()
  })

  describe('when ff enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['event-bridge'])
    })

    it('should detect when the bridge is present', () => {
      initEventBridgeStub()
      expect(isEventBridgePresent()).toBeTrue()
    })

    it('should not detect when the bridge is absent', () => {
      expect(isEventBridgePresent()).toBeFalse()
    })
  })

  describe('when ff disabled', () => {
    it('should not detect when the bridge is present', () => {
      initEventBridgeStub()
      expect(isEventBridgePresent()).toBeFalse()
    })
    it('should not detect when the bridge is absent', () => {
      expect(isEventBridgePresent()).toBeFalse()
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
    const eventBridge = getEventBridge()

    eventBridge.send('view', { foo: 'bar' })

    expect(sendSpy).toHaveBeenCalledOnceWith('{"eventType":"view","event":{"foo":"bar"}}')
  })
})
