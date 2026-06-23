import { BridgeCapability } from '@openobserve/browser-core'
import { mockEventBridge } from '@openobserve/browser-core/test'
import { mockedTrace } from '../test-utils/mockedTrace'
import type { ProfilingPayload } from '../types'
import { createBridgeEmitter } from './profilingBridge'

describe('createBridgeEmitter', () => {
  it('sends the payload through the bridge as a profile event', () => {
    const bridge = mockEventBridge({ capabilities: [BridgeCapability.RECORDS, BridgeCapability.PROFILES] })
    const sendSpy = spyOn(bridge, 'send')
    const emit = createBridgeEmitter()

    const payload: ProfilingPayload = {
      profile: {
        application: { id: 'app-id' },
        attachments: ['wall-time.json'],
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T00:01:00.000Z',
        family: 'chrome',
        runtime: 'chrome',
        format: 'json',
        version: 4,
        tags_profiler: 'sdk_version:1.0.0',
        _oo: { clock_drift: 0 },
      },
      trace: mockedTrace as any,
    }

    emit(payload)

    expect(sendSpy).toHaveBeenCalledOnceWith(jasmine.stringContaining('"eventType":"profile"'))
    const sent = JSON.parse(sendSpy.calls.first().args[0])
    expect(sent.eventType).toBe('profile')
    expect(sent.event.profile).toEqual(payload.profile)
    expect(sent.event.trace).toEqual(payload.trace)
    expect(sent.view).toBeUndefined()
  })
})
