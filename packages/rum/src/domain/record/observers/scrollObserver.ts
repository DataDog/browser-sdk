import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import { DOM_EVENT, throttle, addEventListener } from '@datadog/browser-core'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { getNodePrivacyLevel } from '../privacy'
import { getSerializedNodeId, hasSerializedNode } from '../serializationUtils'

import { getScrollX, getScrollY } from '../viewports'
import type { ScrollPosition } from '../../../types'
import { NodePrivacyLevel } from '../../../constants'
import type { ListenerHandler } from './utils'
import { getEventTarget } from './utils'

const SCROLL_OBSERVER_THRESHOLD = 100

export type ScrollCallback = (p: ScrollPosition) => void

export function initScrollObserver(
  cb: ScrollCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel,
  elementsScrollPositions: ElementsScrollPositions
): ListenerHandler {
  const { throttled: updatePosition } = throttle((event: UIEvent) => {
    const target = getEventTarget(event) as HTMLElement | Document
    if (
      !target ||
      getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
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
    cb({
      id,
      x: scrollPositions.scrollLeft,
      y: scrollPositions.scrollTop,
    })
  }, SCROLL_OBSERVER_THRESHOLD)
  return addEventListener(document, DOM_EVENT.SCROLL, updatePosition, { capture: true, passive: true }).stop
}
