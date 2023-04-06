import type { RumConfiguration } from '@datadog/browser-rum-core'
import { getSessionReplayUrl } from '@datadog/browser-rum-core'

export function getSessionReplayLink(configuration: RumConfiguration): string | undefined {
  return getSessionReplayUrl(configuration, { errorType: 'slim-package' })
}
