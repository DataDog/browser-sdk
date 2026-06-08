import { relativeNow } from '@datadog/browser-core'
import { ONE_SECOND, elapsed } from '@datadog/js-core/time'
import type { RelativeTime } from '@datadog/browser-core'

// Maximum duration for click actions
export const CLICK_ACTION_MAX_DURATION = 10 * ONE_SECOND
export const interactionSelectorCache = new Map<RelativeTime, string>()

export function getInteractionSelector(relativeTimestamp: RelativeTime) {
  const selector = interactionSelectorCache.get(relativeTimestamp)
  interactionSelectorCache.delete(relativeTimestamp)
  return selector
}

export function updateInteractionSelector(relativeTimestamp: RelativeTime, selector: string) {
  interactionSelectorCache.set(relativeTimestamp, selector)
  interactionSelectorCache.forEach((_, relativeTimestamp) => {
    if (elapsed(relativeTimestamp, relativeNow()) > CLICK_ACTION_MAX_DURATION) {
      interactionSelectorCache.delete(relativeTimestamp)
    }
  })
}
