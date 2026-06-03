import {
  createHooks,
  MID_HASH_UUID,
  replaceMockableWithSpy,
  createSessionManagerMock,
} from '@datadog/browser-core/test'
import { mockRumConfiguration, mockViewHistory } from '@datadog/browser-rum-core/test'
import { LifeCycle } from '@datadog/browser-rum-core'
import { createIdentityEncoder } from '@datadog/browser-core'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { makeProfilerApi } from './profilerApi'

describe('profilerApi', () => {
  describe('deterministic sampling', () => {
    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const isProfilingSupportedSpy = replaceMockableWithSpy(isProfilingSupported)
      const profilerApi = makeProfilerApi()

      profilerApi.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        mockViewHistory(),
        createIdentityEncoder
      )

      expect(isProfilingSupportedSpy).not.toHaveBeenCalled()
    })
  })
})
