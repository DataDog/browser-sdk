import { addEventListeners, addTelemetryDebug, DOM_EVENT, throttle } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'
import type { BrowserIncrementalSnapshotRecord, MousemoveData, MousePosition } from '../../../types'
import { IncrementalSource } from '../../../types'
import { getEventTarget, isTouchEvent } from '../eventsUtils'
import { convertMouseEventToLayoutCoordinates } from '../viewports'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './types'

const MOUSE_MOVE_OBSERVER_THRESHOLD = 50

export type MousemoveCallBack = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export function trackMove(configuration: RumConfiguration, moveCb: MousemoveCallBack): Tracker {
  const { throttled: updatePosition, cancel: cancelThrottle } = throttle(
    (event: MouseEvent | TouchEvent) => {
      const target = getEventTarget(event)
      if (hasSerializedNode(target)) {
        const coordinates = tryToComputeCoordinates(event)
        if (!coordinates) {
          return
        }
        const position: MousePosition = {
          id: getSerializedNodeId(target),
          timeOffset: 0,
          x: coordinates.x,
          y: coordinates.y,
        }

        moveCb(
          assembleIncrementalSnapshot<MousemoveData>(
            isTouchEvent(event) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove,
            { positions: [position] }
          )
        )
      }
    },
    MOUSE_MOVE_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )

  const { stop: removeListener } = addEventListeners(
    configuration,
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
    if (event.isTrusted) {
      addTelemetryDebug('mouse/touch event without x/y')
    }
    return undefined
  }
  return { x, y }
}
