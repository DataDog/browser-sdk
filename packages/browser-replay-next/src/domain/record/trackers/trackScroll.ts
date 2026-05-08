import { getNodePrivacyLevel, NodePrivacyLevel } from '../../privacy'
import { IncrementalSource } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, ScrollData } from '../../../types'
import { assembleIncrementalSnapshot } from '../assembly'
import { getEventTarget } from '../eventsUtils'
import type { RecordingScope } from '../recordingScope'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'
import { addEventListener, DOM_EVENT, getScrollX, getScrollY, throttle, timeStampNow } from './domUtils'

const SCROLL_OBSERVER_THRESHOLD = 100

export function trackScroll(
  target: Document | ShadowRoot,
  emitRecord: EmitRecordCallback<BrowserIncrementalSnapshotRecord>,
  scope: RecordingScope
): Tracker {
  const { throttled: updatePosition, cancel: cancelThrottle } = throttle((event: Event) => {
    const eventTarget = getEventTarget(event) as HTMLElement | Document
    if (!eventTarget) {
      return
    }
    const id = scope.nodeIds.get(eventTarget)
    if (
      id === undefined ||
      getNodePrivacyLevel(eventTarget, scope.configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN
    ) {
      return
    }
    const scrollPositions =
      eventTarget === document
        ? {
            scrollTop: getScrollY(),
            scrollLeft: getScrollX(),
          }
        : {
            scrollTop: Math.round((eventTarget as HTMLElement).scrollTop),
            scrollLeft: Math.round((eventTarget as HTMLElement).scrollLeft),
          }
    scope.elementsScrollPositions.set(eventTarget, scrollPositions)
    emitRecord(
      assembleIncrementalSnapshot<ScrollData>(
        IncrementalSource.Scroll,
        {
          id,
          x: scrollPositions.scrollLeft,
          y: scrollPositions.scrollTop,
        },
        timeStampNow()
      )
    )
  }, SCROLL_OBSERVER_THRESHOLD)

  const { stop: removeListener } = addEventListener(
    scope.configuration,
    target,
    DOM_EVENT.SCROLL,
    updatePosition as (event: Event) => void,
    {
      capture: true,
      passive: true,
    }
  )

  return {
    stop: () => {
      removeListener()
      cancelThrottle()
    },
  }
}
