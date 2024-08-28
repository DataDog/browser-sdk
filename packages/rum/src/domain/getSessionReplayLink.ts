import type { RumConfiguration, RumSessionManager, ViewHistoryEntries, RumSession } from '@datadog/browser-rum-core'
import { getSessionReplayUrl, SessionReplayState } from '@datadog/browser-rum-core'
import { isBrowserSupported } from '../boot/isBrowserSupported'

export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewHistoryEntries,
  isRecordingStarted: boolean
): string | undefined {
  const session = sessionManager.findTrackedSession()
  const errorType = getErrorType(session, isRecordingStarted)
  const viewContext = viewContexts.findView()

  return getSessionReplayUrl(configuration, {
    viewContext,
    errorType,
    session,
  })
}

function getErrorType(session: RumSession | undefined, isRecordingStarted: boolean) {
  if (!isBrowserSupported()) {
    return 'browser-not-supported'
  }
  if (!session) {
    // possibilities:
    // - rum sampled out
    // - session expired (edge case)
    return 'rum-not-tracked'
  }
  if (session.sessionReplay === SessionReplayState.OFF) {
    // possibilities
    // - replay sampled out
    return 'incorrect-session-plan'
  }
  if (!isRecordingStarted) {
    return 'replay-not-started'
  }
}
