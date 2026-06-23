import type { RumConfiguration, ViewHistory } from '@openobserve/browser-rum-core'
import { getSessionReplayUrl, SessionReplayState, computeSessionReplayState } from '@openobserve/browser-rum-core'
import type { SessionManager, SessionContext } from '@openobserve/browser-core'
export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  viewHistory: ViewHistory,
  isRecordingStarted: boolean
): string | undefined {
  const session = sessionManager.findTrackedSession()
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
  session: SessionContext | undefined,
  isRecordingStarted: boolean
) {
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
