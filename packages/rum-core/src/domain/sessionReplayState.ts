import type { SessionContext } from '@datadog/browser-core'
import { correctedChildSampleRate, isSampled } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'

export const enum SessionReplayState {
  OFF,
  SAMPLED,
  FORCED,
}

export function computeSessionReplayState(
  session: SessionContext,
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
