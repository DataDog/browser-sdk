import { elapsed, ONE_SECOND, relativeNow } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'

// Maximum duration for click actions
export const CLICK_ACTION_MAX_DURATION = 10 * ONE_SECOND
const cache = new Map<RelativeTime, string>()

export const interactionSelectorCache = {
  interactionSelectors: cache,
  get: (relativeTimestamp: RelativeTime) => {
    const selector = cache.get(relativeTimestamp)
    cache.delete(relativeTimestamp)
    return selector
  },
  set: (relativeTimestamp: RelativeTime, selector: string) => {
    cache.set(relativeTimestamp, selector)
    cache.forEach((_, relativeTimestamp) => {
      if (elapsed(relativeTimestamp, relativeNow()) > CLICK_ACTION_MAX_DURATION) {
        cache.delete(relativeTimestamp)
      }
    })
  },
}
