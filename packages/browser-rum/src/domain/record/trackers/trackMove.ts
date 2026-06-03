import { addEventListeners, DOM_EVENT, throttle } from '@datadog/browser-core'
import type { BrowserIncrementalSnapshotRecord, MousemoveData, MousePosition } from '../../../types'
import { IncrementalSource } from '../../../types'
import { getEventTarget, isTouchEvent } from '../eventsUtils'
import { convertMouseEventToLayoutCoordinates } from '../viewports'
import { assembleIncrementalSnapshot } from '../assembly'
import type { RecordingScope } from '../recordingScope'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'

const MOUSE_MOVE_OBSERVER_THRESHOLD = 50

export function trackMove(
  emitRecord: EmitRecordCallback<BrowserIncrementalSnapshotRecord>,
  scope: RecordingScope
): Tracker {
  const { throttled: updatePosition, cancel: cancelThrottle } = throttle(
    (event: MouseEvent | TouchEvent) => {
      const target = getEventTarget(event)
      const id = scope.nodeIds.get(target)
      if (id === undefined) {
        return
      }
      const coordinates = tryToComputeCoordinates(event)
      if (!coordinates) {
        return
      }
      const position: MousePosition = {
        id,
        timeOffset: 0,
        x: coordinates.x,
        y: coordinates.y,
      }

      emitRecord(
        assembleIncrementalSnapshot<MousemoveData>(
          isTouchEvent(event) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove,
          { positions: [position] }
        )
      )
    },
    MOUSE_MOVE_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )

  const { stop: removeListener } = addEventListeners(
    scope.configuration,
    document,
    [DOM_EVENT.MOUSE_MOVE, DOM_EVENT.TOUCH_MOVE],
    updatePosition,
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

export function tryToComputeCoordinates(event: MouseEvent | TouchEvent) {
  let { clientX: x, clientY: y } = isTouchEvent(event) ? event.changedTouches[0] : event
  if (window.visualViewport) {
    const { visualViewportX, visualViewportY } = convertMouseEventToLayoutCoordinates(x, y)
    x = visualViewportX
    y = visualViewportY
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }
  return { x, y }
}
