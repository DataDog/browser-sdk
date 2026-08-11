import { throttle, DOM_EVENT, addEventListeners, noop } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/js-core/time'
import type { ViewportDimension } from '@datadog/browser-rum-core'
import { initViewportObservable } from '@datadog/browser-rum-core'
import { IncrementalSource, RecordType } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, ViewportResizeData, VisualViewportRecord } from '../../../types'
import { getVisualViewport } from '../viewports'
import { assembleIncrementalSnapshot } from '../assembly'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export function trackViewportResize(emitRecord: EmitRecordCallback<BrowserIncrementalSnapshotRecord>): Tracker {
  const viewportResizeSubscription = initViewportObservable().subscribe((data: ViewportDimension) => {
    emitRecord(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, data))
  })

  return {
    stop: () => {
      viewportResizeSubscription.unsubscribe()
    },
  }
}

export function trackVisualViewportResize(emitRecord: EmitRecordCallback<VisualViewportRecord>): Tracker {
  const visualViewport = window.visualViewport
  if (!visualViewport) {
    return { stop: noop }
  }
  const { throttled: updateDimension, cancel: cancelThrottle } = throttle(
    () => {
      emitRecord({
        data: getVisualViewport(visualViewport),
        type: RecordType.VisualViewport,
        timestamp: timeStampNow(),
      })
    },
    VISUAL_VIEWPORT_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )
  const { stop: removeListener } = addEventListeners(
    visualViewport,
    [DOM_EVENT.RESIZE, DOM_EVENT.SCROLL],
    updateDimension,
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
