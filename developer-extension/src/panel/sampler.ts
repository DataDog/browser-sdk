import { isSampled } from '@datadog/browser-rum-core'

export function computeRumTrackingType(
  sessionId: string,
  config: { sessionSampleRate?: number; sessionReplaySampleRate?: number }
): string {
  const sessionSampleRate = config.sessionSampleRate ?? 100
  const sessionReplaySampleRate = config.sessionReplaySampleRate ?? 0

  if (!isSampled(sessionId, sessionSampleRate)) {
    return '0' // NOT_TRACKED
  }

  if (isSampled(sessionId, (sessionSampleRate * sessionReplaySampleRate) / 100)) {
    return '1' // TRACKED_WITH_SESSION_REPLAY
  }

  return '2' // TRACKED_WITHOUT_SESSION_REPLAY
}

export function computeLogsTrackingType(sessionId: string, config: { sessionSampleRate?: number }): string {
  const sessionSampleRate = config.sessionSampleRate ?? 100

  if (!isSampled(sessionId, sessionSampleRate)) {
    return '0' // NOT_TRACKED
  }

  return '1' // TRACKED
}
