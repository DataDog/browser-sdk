import { DOM_EVENT, throttle, addEventListener } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { getScrollX, getScrollY, getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { getEventTarget } from '../eventsUtils'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'
import { IncrementalSource } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, ScrollData } from '../../../types'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './types'

const SCROLL_OBSERVER_THRESHOLD = 100

export type ScrollCallback = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export function trackScroll(
  configuration: RumConfiguration,
  scrollCb: ScrollCallback,
  elementsScrollPositions: ElementsScrollPositions,
  target: Document | ShadowRoot = document
): Tracker {
  const { throttled: updatePosition, cancel: cancelThrottle } = throttle((event: Event) => {
    const target = getEventTarget(event) as HTMLElement | Document
    if (
      !target ||
      getNodePrivacyLevel(target, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
      !hasSerializedNode(target)
    ) {
      return
    }
    const id = getSerializedNodeId(target)
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
    elementsScrollPositions.set(target, scrollPositions)
    scrollCb(
      assembleIncrementalSnapshot<ScrollData>(IncrementalSource.Scroll, {
        id,
        x: scrollPositions.scrollLeft,
        y: scrollPositions.scrollTop,
      })
    )
  }, SCROLL_OBSERVER_THRESHOLD)

  const { stop: removeListener } = addEventListener(configuration, target, DOM_EVENT.SCROLL, updatePosition, {
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
