import type { ServerDuration } from '@flashcatcloud/browser-core'
import { isNumber } from '@flashcatcloud/browser-core'

export function discardNegativeDuration(duration: ServerDuration | undefined): ServerDuration | undefined {
  return isNumber(duration) && duration < 0 ? undefined : duration
}
