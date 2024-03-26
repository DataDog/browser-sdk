import { throttle, DOM_EVENT, addEventListeners, timeStampNow, noop } from '@datadog/browser-core'
import type { RumConfiguration, ViewportDimension } from '@datadog/browser-rum-core'
import { initViewportObservable } from '@datadog/browser-rum-core'
import { IncrementalSource, RecordType } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, ViewportResizeData, VisualViewportRecord } from '../../../types'
import { getVisualViewport } from '../viewports'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './types'

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export type ViewportResizeCallback = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export type VisualViewportResizeCallback = (visualViewportRecord: VisualViewportRecord) => void

export function trackViewportResize(
  configuration: RumConfiguration,
  viewportResizeCb: ViewportResizeCallback
): Tracker {
  const viewportResizeSubscription = initViewportObservable(configuration).subscribe((data: ViewportDimension) => {
    viewportResizeCb(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, data))
  })

  return {
    stop: () => {
      viewportResizeSubscription.unsubscribe()
    },
  }
}

export function tackVisualViewportResize(
  configuration: RumConfiguration,
  visualViewportResizeCb: VisualViewportResizeCallback
): Tracker {
  const visualViewport = window.visualViewport
  if (!visualViewport) {
    return { stop: noop }
  }
  const { throttled: updateDimension, cancel: cancelThrottle } = throttle(
    () => {
      visualViewportResizeCb({
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
    configuration,
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
