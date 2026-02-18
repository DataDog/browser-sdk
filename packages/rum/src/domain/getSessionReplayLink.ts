import type { RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import { getSessionReplayUrl, SessionReplayState, computeSessionReplayState } from '@datadog/browser-rum-core'
import type { SessionManager, TrackedSession } from '@datadog/browser-core'
import { isBrowserSupported } from '../boot/isBrowserSupported'

export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  viewHistory: ViewHistory,
  isRecordingStarted: boolean
): string | undefined {
  const session = sessionManager.findTrackedSession(configuration.sessionSampleRate)
  const errorType = getErrorType(configuration, session, isRecordingStarted)
  const viewContext = viewHistory.findView()

  return getSessionReplayUrl(configuration, {
    viewContext,
    errorType,
    session,
  })
}

function getErrorType(
  configuration: RumConfiguration,
  session: TrackedSession | undefined,
  isRecordingStarted: boolean
) {
  if (!isBrowserSupported()) {
    return 'browser-not-supported'
  }
  if (!session) {
    // possibilities:
    // - rum sampled out
    // - session expired (edge case)
    return 'rum-not-tracked'
  }
  if (computeSessionReplayState(session, configuration) === SessionReplayState.OFF) {
    // possibilities
    // - replay sampled out
    return 'incorrect-session-plan'
  }
  if (!isRecordingStarted) {
    return 'replay-not-started'
  }
}
