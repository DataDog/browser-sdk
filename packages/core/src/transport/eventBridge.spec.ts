import { deleteDatadogEventBridgeStub, initDatadogEventBridgeStub } from '../../test/specHelper'
import { isEventBridgeDetected } from './eventBridge'
describe('eventBridge', () => {
  beforeEach(() => {
    initDatadogEventBridgeStub()
  })

  afterEach(() => {
    deleteDatadogEventBridgeStub()
  })

  it('should detect event bridge', () => {
    expect(isEventBridgeDetected()).toBeTrue()
  })
})
