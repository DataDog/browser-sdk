import { IncrementalSource, RecordType } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, ViewportResizeData, VisualViewportRecord } from '../../../types'
import { getVisualViewport } from '../viewports'
import { assembleIncrementalSnapshot } from '../assembly'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { Tracker } from './tracker.types'
import {
  addEventListeners,
  DOM_EVENT,
  getViewportDimension,
  initViewportObservable,
  noop,
  throttle,
  timeStampNow,
} from './domUtils'

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export function trackViewportResize(
  emitRecord: EmitRecordCallback<BrowserIncrementalSnapshotRecord>,
  scope: RecordingScope
): Tracker {
  const subscription = initViewportObservable(scope.configuration, (data) => {
    emitRecord(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, data, timeStampNow()))
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}

export function trackVisualViewportResize(
  emitRecord: EmitRecordCallback<VisualViewportRecord>,
  scope: RecordingScope
): Tracker {
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
    scope.configuration,
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
