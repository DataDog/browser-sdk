import type { SessionContext } from '@datadog/browser-core'
import { BridgeCapability } from '@datadog/browser-core'
import { HIGH_HASH_UUID, LOW_HASH_UUID, MID_HASH_UUID, mockEventBridge } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { SessionReplayState, computeSessionReplayState } from './sessionReplayState'

describe('computeSessionReplayState', () => {
  describe('in bridge environment', () => {
    it('should return SAMPLED when bridge supports RECORDS, regardless of sample rates', () => {
      mockEventBridge({ capabilities: [BridgeCapability.RECORDS] })
      const session: SessionContext = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 0 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
    })

    it('should return OFF when bridge does not support RECORDS, regardless of sample rates', () => {
      mockEventBridge({ capabilities: [] })
      const session: SessionContext = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 100 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })
  })

  it('should return SAMPLED when replay is sampled in', () => {
    const session: SessionContext = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
    const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 100 })
    expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
  })

  it('should return OFF when replay is sampled out', () => {
    const session: SessionContext = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
    const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 99 })
    expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
  })

  it('should return FORCED when replay is forced', () => {
    const session: SessionContext = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: true }
    const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 0 })
    expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.FORCED)
  })

  it('should apply the correction factor for chained sampling on the replay sample rate', () => {
    const session: SessionContext = { id: MID_HASH_UUID, anonymousId: undefined, isReplayForced: false }
    const configuration = mockRumConfiguration({ sessionSampleRate: 60, sessionReplaySampleRate: 60 })
    expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
  })

  it('should sample replay for a session whose ID has a low hash, even with a low sessionReplaySampleRate', () => {
    const session: SessionContext = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
    const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 1 })
    expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
  })

  it('should not sample replay for a session whose ID has a high hash, even with a high sessionReplaySampleRate', () => {
    const session: SessionContext = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
    const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 99 })
    expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
  })
})
