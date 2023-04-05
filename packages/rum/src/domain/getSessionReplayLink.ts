import type {
  RumConfiguration,
  RumSessionManager,
  ViewContext,
  ViewContexts,
  RumSession,
} from '@datadog/browser-rum-core'
import { getDatadogSiteUrl } from '@datadog/browser-rum-core'
import { isBrowserSupported } from '../boot/isBrowserSupported'
import { getReplayStats } from './replayStats'

export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts
): string | undefined {
  const session = sessionManager.findTrackedSession()
  const parameters: string[] = []
  const sessionId = session ? session.id : 'no-session-id'

  const view = viewContexts.findView()

  const errorType = getErrorType(session, view)
  if (errorType) {
    parameters.push(`error-type=${errorType}`)
  }
  if (view) {
    parameters.push(`seed=${view.id}`)
    parameters.push(`from=${view.startClocks.timeStamp}`)
  }

  const origin = getDatadogSiteUrl(configuration)
  const path = `/rum/replay/sessions/${sessionId}`
  return `${origin}${path}?${parameters.join('&')}`
}

function getErrorType(session: RumSession | undefined, view: ViewContext | undefined) {
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
  if (view && !getReplayStats(view.id)) {
    return 'replay-not-started'
  }
}
