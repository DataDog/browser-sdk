import type { SessionContext } from '@datadog/browser-core'
import {
  BridgeCapability,
  bridgeSupports,
  canUseEventBridge,
  correctedChildSampleRate,
  isSampled,
} from '@datadog/browser-core'
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
  if (canUseEventBridge()) {
    return bridgeSupports(BridgeCapability.RECORDS) ? SessionReplayState.SAMPLED : SessionReplayState.OFF
  }
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
