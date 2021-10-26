import { resetExperimentalFeatures, updateExperimentalFeatures } from '..'
import { deleteDatadogEventBridgeStub, initDatadogEventBridgeStub } from '../../test/specHelper'
import { isEventBridgeDetected } from './eventBridge'

describe('isEventBridgeDetected', () => {
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
      expect(isEventBridgeDetected()).toBeTrue()
    })

    it('should not detect when the bridge is absent', () => {
      expect(isEventBridgeDetected()).toBeFalse()
    })
  })

  describe('when ff disabled', () => {
    it('should not detect when the bridge is present', () => {
      initDatadogEventBridgeStub()
      expect(isEventBridgeDetected()).toBeFalse()
    })
    it('should not detect when the bridge is absent', () => {
      expect(isEventBridgeDetected()).toBeFalse()
    })
  })
})
