import type {
  RumConfiguration,
  RumSessionManager,
  ViewContexts,
  RumSession,
  SessionReplayUrlQueryParams,
} from '@datadog/browser-rum-core'
import { getSessionReplayUrl } from '@datadog/browser-rum-core'
import { isBrowserSupported } from '../boot/isBrowserSupported'

export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  isRecordingStarted: boolean
): string | undefined {
  const session = sessionManager.findTrackedSession()
  const sessionId = session ? session.id : 'no-session-id'
  const queryParams: SessionReplayUrlQueryParams = {}

  const errorType = getErrorType(session, isRecordingStarted)
  if (errorType) {
    queryParams.errorType = errorType
  }

  const view = viewContexts.findView()
  if (view) {
    queryParams.seed = view.id
    queryParams.from = view.startClocks.timeStamp
  }

  return getSessionReplayUrl(configuration, sessionId, queryParams)
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
