import type { RumConfiguration, RumSessionManager, ViewContexts, RumSession } from '@datadog/browser-rum-core'
import { getSessionReplayUrl } from '@datadog/browser-rum-core'
import { isBrowserSupported } from '../boot/isBrowserSupported'

export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  isRecordingStarted: boolean
): string | undefined {
  const session = sessionManager.findTrackedSession()
  const errorType = getErrorType(session, isRecordingStarted)
  const viewContext = viewContexts.findView()

  return getSessionReplayUrl(configuration, {
    session,
    viewContext,
    errorType,
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
  if (!session.sessionReplayAllowed) {
    // possibilities
    // - replay sampled out
    return 'incorrect-session-plan'
  }
  if (!isRecordingStarted) {
    return 'replay-not-started'
  }
}
