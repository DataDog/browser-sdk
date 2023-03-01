import type { RumConfiguration, RumSessionManager, ViewContexts } from '@datadog/browser-rum-core'
import { getDatadogOrigin } from '@datadog/browser-rum-core'
import { getReplayStats } from './replayStats'

export function getSessionReplayLink(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts
): string | undefined {
  const session = sessionManager.findTrackedSession()
  const queryParams: Record<string, string> = {}
  let sessionId: string
  if (session) {
    sessionId = session.id

    if (session.sessionReplayAllowed === false) {
      // possibilities
      // - replay sampled out
      queryParams['error-type'] = 'incorrect-session-plan'
    }
  } else {
    // possibilities:
    // - rum sampled out
    // - session expired (edge case)
    queryParams['error-type'] = 'rum-not-tracked'
    sessionId = 'session-id'
  }
  const view = viewContexts.findView()
  if (view) {
    queryParams['seed'] = view.id
    queryParams['from'] = `${view.startClocks.timeStamp}`
    const replayStats = getReplayStats(view.id)
    if (!replayStats && !queryParams['error-type']) {
      queryParams['error-type'] = 'replay-not-started'
    }
  }

  let path = `/rum/replay/sessions/${sessionId}`
  if (Object.keys(queryParams).length > 0) {
    const queryParamNames = Object.keys(queryParams)
    path += `?${queryParamNames.map((name) => `${name}=${queryParams[name]}`).join('&')}`
  }

  const origin = getDatadogOrigin(configuration)
  return `${origin}${path}`
}
