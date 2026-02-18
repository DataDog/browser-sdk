import { replaceMockableWithSpy } from '@datadog/browser-core/test'
import { createRumSessionManagerMock, mockRumConfiguration } from '@datadog/browser-rum-core/test'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { makeProfilerApi } from './profilerApi'

// UUID known to yield a mid-range hash value (~50.7%) using the Knuth formula
const MID_HASH_UUID = '88ef85ab-7902-45f0-b93b-2def1ec3e5fe'

describe('profilerApi', () => {
  describe('deterministic sampling', () => {
    beforeEach(() => {
      if (!window.BigInt) {
        pending('BigInt is not supported')
      }
    })

    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const isProfilingSupportedSpy = replaceMockableWithSpy(isProfilingSupported)
      const profilerApi = makeProfilerApi()

      profilerApi.onRumStart(
        {} as any,
        {} as any,
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createRumSessionManagerMock().setId(MID_HASH_UUID),
        {} as any,
        {} as any,
        {} as any
      )

      expect(isProfilingSupportedSpy).not.toHaveBeenCalled()
    })
  })
})
