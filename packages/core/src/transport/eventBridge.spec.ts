import { deleteDatadogEventBridgeStub, initDatadogEventBridgeStub } from '../../test/specHelper'
import { DatadogEventBridge, getEventBridge, isEventBridgeDetected } from './eventBridge'
describe('eventBridge', () => {
  let eventBridgeStub: DatadogEventBridge
  beforeEach(() => {
    eventBridgeStub = initDatadogEventBridgeStub()
  })

  afterEach(() => {
    deleteDatadogEventBridgeStub()
  })

  it('should serialize the event for the datadog bridge', () => {
    const sendSpy = spyOn(eventBridgeStub, 'send')
    const bridge = getEventBridge()
    const event = { foo: 'bar' }
    const eventType = 'tum'

    bridge.send(eventType, event)

    expect(sendSpy).toHaveBeenCalledOnceWith(JSON.stringify({ eventType, event }))
  })
})
