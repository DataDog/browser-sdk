import type { RumConfiguration } from '@datadog/browser-rum-core'
import { getDatadogOrigin } from '@datadog/browser-rum-core'

export function getSessionReplayLink(configuration: RumConfiguration): string | undefined {
  const origin = getDatadogOrigin(configuration)
  return `${origin}/rum/replay/sessions/session-id?error-type=slim-package`
}
