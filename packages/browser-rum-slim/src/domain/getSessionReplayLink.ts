import type { RumConfiguration } from '@openobserve/browser-rum-core'
import { getSessionReplayUrl } from '@openobserve/browser-rum-core'

export function getSessionReplayLink(configuration: RumConfiguration): string | undefined {
  return getSessionReplayUrl(configuration, { errorType: 'slim-package' })
}
