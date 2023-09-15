export interface Coordinates {
  x: number
  y: number
}

/**
 * This is a framework agnostic drag implementation that works as a state machine:
 *
 * ```
 *  (init)
 *    |
 *  [onStart]
 *    |   \______________
 *    |                  \
 *  <returns true>      <returns false>
 *    |     ____          |
 *    |    /    \       (end)
 *  [onMove]     )
 *    |  \ \____/
 *    |   \______________
 *    |                  \
 *  <drop in the window>  |
 *    |                <stop() called or drop out of the window>
 *    |                   |
 *  [onDrop]           [onAbort]
 *    | _________________/
 *    |/
 *  (end)
 * ```
 */
export function initDrag({
  target,
  onStart,
  onMove,
  onAbort,
  onDrop,
}: {
  target: HTMLElement
  onStart: (event: { target: HTMLElement; position: Coordinates }) => boolean | void
  onMove: (event: { position: Coordinates }) => void
  onDrop: () => void
  onAbort: () => void
}) {
  type DragState =
    | { isDragging: false }
    | {
        isDragging: true
        removeListeners: () => void
      }

  let state: DragState = {
    isDragging: false,
  }

  target.addEventListener('pointerdown', onPointerDown, { capture: true })

  return {
    stop: () => {
      endDrag(true)
      target.removeEventListener('pointerdown', onPointerDown, { capture: true })
    },
  }

  function onPointerDown(event: PointerEvent) {
    if (
      state.isDragging ||
      event.buttons !== 1 ||
      onStart({ target: event.target as HTMLElement, position: { x: event.clientX, y: event.clientY } }) === false
    ) {
      return
    }

    event.preventDefault()

    state = {
      isDragging: true,
      removeListeners: () => {
        removeEventListener('pointerup', onPointerUp, { capture: true })
        removeEventListener('pointermove', onPointerMove, { capture: true })
      },
    }

    addEventListener('pointerup', onPointerUp, { capture: true })
    addEventListener('pointermove', onPointerMove, { capture: true })
  }

  function onPointerUp(_event: PointerEvent) {
    endDrag(false)
  }

  function onPointerMove(event: PointerEvent) {
    if (!state.isDragging) {
      return
    }

    if (event.buttons !== 1) {
      // The user might have released the click outside of the window
      endDrag(true)
      return
    }

    onMove({
      position: {
        x: event.clientX,
        y: event.clientY,
      },
    })
  }

  function endDrag(abort: boolean) {
    if (state.isDragging) {
      if (abort) {
        onAbort()
      } else {
        onDrop()
      }
      state.removeListeners()
      state = { isDragging: false }
    }
  }
}
