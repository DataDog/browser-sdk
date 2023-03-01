import type { RumConfiguration, RumSessionManager, ViewContexts } from '@datadog/browser-rum-core'

export function getReplayLink(
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  subdomain: string
): string | undefined {
  const site = configuration.site
  const session = sessionManager.findTrackedSession()
  if (!session) {
    return undefined
  }
  const sessionId = session.id
  const view = viewContexts.findView()
  if (!view) {
    return `https://${subdomain}.${site}/rum/replay/sessions/${sessionId}`
  }
  return `https://${subdomain}.${site}/rum/replay/sessions/${sessionId}?seed=${view.id}&from=${view.startClocks.timeStamp}`
}
