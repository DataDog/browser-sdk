import type { ServerDuration } from '@datadog/browser-core'
import { isNumber } from '@datadog/browser-core'

export function discardNegativeDuration(duration: ServerDuration | undefined): ServerDuration | undefined {
  return isNumber(duration) && duration < 0 ? undefined : duration
}
