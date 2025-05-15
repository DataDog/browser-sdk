import type { RumConfiguration } from '@flashcatcloud/browser-rum-core'
import { getSessionReplayUrl } from '@flashcatcloud/browser-rum-core'

export function getSessionReplayLink(configuration: RumConfiguration): string | undefined {
  return getSessionReplayUrl(configuration, { errorType: 'slim-package' })
}
