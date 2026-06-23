import type { ServerDuration } from '@openobserve/js-core/time'
import { isNumber } from '@openobserve/browser-core'

export function discardNegativeDuration(duration: ServerDuration | undefined): ServerDuration | undefined {
  return isNumber(duration) && duration < 0 ? undefined : duration
}
