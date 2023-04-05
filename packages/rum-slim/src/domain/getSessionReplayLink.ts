import type { RumConfiguration } from '@datadog/browser-rum-core'
import { getDatadogSiteUrl } from '@datadog/browser-rum-core'

export function getSessionReplayLink(configuration: RumConfiguration): string | undefined {
  const origin = getDatadogSiteUrl(configuration)
  return `${origin}/rum/replay/sessions/no-session-id?error-type=slim-package`
}
