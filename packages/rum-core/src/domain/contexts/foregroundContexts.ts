import type { RelativeTime, Duration, ServerDuration } from '@datadog/browser-core'
import { toServerDuration } from '@datadog/browser-core'
import type { InForegroundPeriod, PageStateServerEntry } from '../../rawRumEvent.types'
import { PageState } from './pageStateHistory'

export interface ForegroundPeriod {
  start: RelativeTime
  end?: RelativeTime
}

// Todo: Remove in the next major release
export function mapToForegroundPeriods(
  pageStateServerEntries: PageStateServerEntry[],
  duration: Duration
): InForegroundPeriod[] {
  const foregroundPeriods: InForegroundPeriod[] = []
  for (let i = 0; i < pageStateServerEntries.length; i++) {
    const current = pageStateServerEntries[i]
    const next = pageStateServerEntries[i + 1]

    if (current.state === PageState.ACTIVE) {
      const start = current.start >= 0 ? current.start : (0 as ServerDuration)
      const end = next ? next.start : toServerDuration(duration)
      foregroundPeriods.push({
        start,
        duration: (end - start) as ServerDuration,
      })
    }
  }

  return foregroundPeriods
}
