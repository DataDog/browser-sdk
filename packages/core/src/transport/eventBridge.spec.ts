import { resetExperimentalFeatures, updateExperimentalFeatures } from '..'
import { deleteDatadogEventBridgeStub, initDatadogEventBridgeStub } from '../../test/specHelper'
import { isEventBridgeDetected } from './eventBridge'
describe('eventBridge', () => {
  beforeEach(() => {
    initDatadogEventBridgeStub()
  })

  afterEach(() => {
    resetExperimentalFeatures()
    deleteDatadogEventBridgeStub()
  })

  it('should detect event bridge if ff enabled', () => {
    updateExperimentalFeatures(['event-bridge'])
    expect(isEventBridgeDetected()).toBeTrue()
  })

  it('should not detect event bridge if ff disabled', () => {
    expect(isEventBridgeDetected()).toBeFalse()
  })
})
