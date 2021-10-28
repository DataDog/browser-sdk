import { resetExperimentalFeatures, updateExperimentalFeatures } from '..'
import { deleteDatadogEventBridgeStub, initDatadogEventBridgeStub } from '../../test/specHelper'
import { isEventBridgePresent } from './eventBridge'

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
