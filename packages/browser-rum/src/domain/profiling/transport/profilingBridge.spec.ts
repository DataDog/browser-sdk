import { vi, describe, expect, it } from 'vitest'
import { BridgeCapability } from '@datadog/browser-core'
import { mockEventBridge } from '@datadog/browser-core/test'
import { mockedTrace } from '../test-utils/mockedTrace'
import type { ProfilingPayload } from '../types'
import { createBridgeEmitter } from './profilingBridge'

describe('createBridgeEmitter', () => {
  it('sends the payload through the bridge as a profile event', () => {
    const bridge = mockEventBridge({ capabilities: [BridgeCapability.RECORDS, BridgeCapability.PROFILES] })
    const sendSpy = vi.spyOn(bridge, 'send').mockImplementation(() => undefined)
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
        _dd: { clock_drift: 0 },
      },
      trace: mockedTrace as any,
    }

    emit(payload)

    expect(sendSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"eventType":"profile"'))
    const sent = JSON.parse(sendSpy.mock.calls[0][0])
    expect(sent.eventType).toBe('profile')
    expect(sent.event.profile).toEqual(payload.profile)
    expect(sent.event.trace).toEqual(payload.trace)
    expect(sent.view).toBeUndefined()
  })
})
