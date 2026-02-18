import type { TrackedSession } from '@datadog/browser-core'
import { correctedChildSampleRate, isSampled } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'

export const enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
  CI_TEST = 'ci_test',
}

export const enum SessionReplayState {
  OFF,
  SAMPLED,
  FORCED,
}

export function computeSessionReplayState(
  session: TrackedSession,
  configuration: RumConfiguration
): SessionReplayState {
  if (
    isSampled(
      session.id,
      correctedChildSampleRate(configuration.sessionSampleRate, configuration.sessionReplaySampleRate)
    )
  ) {
    return SessionReplayState.SAMPLED
  }
  if (session.isReplayForced) {
    return SessionReplayState.FORCED
  }
  return SessionReplayState.OFF
}
