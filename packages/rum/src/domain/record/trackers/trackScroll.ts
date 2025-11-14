import { DOM_EVENT, throttle, addEventListener } from '@datadog/browser-core'
import { getScrollX, getScrollY, getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import { getEventTarget } from '../eventsUtils'
import { IncrementalSource } from '../../../types'
import type { ScrollData } from '../../../types'
import { assembleIncrementalSnapshot } from '../assembly'
import type { SerializationScope } from '../serialization'
import type { Tracker } from './tracker.types'

const SCROLL_OBSERVER_THRESHOLD = 100

export function trackScroll(scope: SerializationScope, target: Document | ShadowRoot = document): Tracker {
  const { throttled: updatePosition, cancel: cancelThrottle } = throttle((event: Event) => {
    scope.captureEvent(() => {
      const target = getEventTarget(event) as HTMLElement | Document
      if (!target) {
        return
      }
      const id = scope.nodeIds.get(target)
      if (
        id === undefined ||
        getNodePrivacyLevel(target, scope.configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN
      ) {
        return
      }
      const scrollPositions =
        target === document
          ? {
              scrollTop: getScrollY(),
              scrollLeft: getScrollX(),
            }
          : {
              scrollTop: Math.round((target as HTMLElement).scrollTop),
              scrollLeft: Math.round((target as HTMLElement).scrollLeft),
            }
      scope.elementsScrollPositions.set(target, scrollPositions)
      return assembleIncrementalSnapshot<ScrollData>(IncrementalSource.Scroll, {
        id,
        x: scrollPositions.scrollLeft,
        y: scrollPositions.scrollTop,
      })
    })
  }, SCROLL_OBSERVER_THRESHOLD)

  const { stop: removeListener } = addEventListener(scope.configuration, target, DOM_EVENT.SCROLL, updatePosition, {
    capture: true,
    passive: true,
  })

  return {
    stop: () => {
      removeListener()
      cancelThrottle()
    },
  }
}
