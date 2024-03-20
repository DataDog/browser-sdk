import { throttle, DOM_EVENT, addEventListeners, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration, ViewportDimension } from '@datadog/browser-rum-core'
import { initViewportObservable } from '@datadog/browser-rum-core'
import { IncrementalSource, RecordType } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, ViewportResizeData, VisualViewportRecord } from '../../../types'
import { getVisualViewport } from '../viewports'
import { assembleIncrementalSnapshot } from '../assembly'

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export type ViewportResizeCallback = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export type VisualViewportResizeCallback = (visualViewportRecord: VisualViewportRecord) => void

export function initViewportResizeObserver(configuration: RumConfiguration, viewportResizeCb: ViewportResizeCallback) {
  const viewportResizeSubscription = initViewportObservable(configuration).subscribe((data: ViewportDimension) => {
    viewportResizeCb(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, data))
  })

  return {
    stop: () => {
      viewportResizeSubscription.unsubscribe()
    },
  }
}

export function initVisualViewportResizeObserver(
  configuration: RumConfiguration,
  visualViewportResizeCb: VisualViewportResizeCallback
) {
  const visualViewport = window.visualViewport
  if (!visualViewport) {
    return { stop: () => {} }
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
