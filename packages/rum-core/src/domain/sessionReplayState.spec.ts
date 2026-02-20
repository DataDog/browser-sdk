import type { TrackedSession } from '@datadog/browser-core'
import { HIGH_HASH_UUID, LOW_HASH_UUID, MID_HASH_UUID } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import { SessionReplayState, computeSessionReplayState } from './sessionReplayState'

describe('computeSessionReplayState', () => {
  describe('with bigint support', () => {
    beforeEach(() => {
      if (!window.BigInt) {
        pending('BigInt is not supported')
      }
    })

    it('should return SAMPLED when replay is sampled in', () => {
      const session: TrackedSession = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 100 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
    })

    it('should return OFF when replay is sampled out', () => {
      const session: TrackedSession = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 99 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })

    it('should return FORCED when replay is forced', () => {
      const session: TrackedSession = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: true }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 0 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.FORCED)
    })

    it('should apply the correction factor for chained sampling on the replay sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and sessionReplaySampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const session: TrackedSession = { id: MID_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 60, sessionReplaySampleRate: 60 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })

    it('should sample replay for a session whose ID has a low hash, even with a low sessionReplaySampleRate', () => {
      const session: TrackedSession = { id: LOW_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 1 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.SAMPLED)
    })

    it('should not sample replay for a session whose ID has a high hash, even with a high sessionReplaySampleRate', () => {
      const session: TrackedSession = { id: HIGH_HASH_UUID, anonymousId: undefined, isReplayForced: false }
      const configuration = mockRumConfiguration({ sessionSampleRate: 100, sessionReplaySampleRate: 99 })
      expect(computeSessionReplayState(session, configuration)).toBe(SessionReplayState.OFF)
    })
  })
})
