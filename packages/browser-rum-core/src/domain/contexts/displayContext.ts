import { monitor } from '@datadog/js-core/monitor'
import { globalObject } from '@datadog/js-core/util'
import type { ViewportDimension } from '../../browser/viewportObservable'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'
import type { AssembleHook, DefaultRumEventAttributes } from '../hooks'

export type DisplayContext = ReturnType<typeof startDisplayContext>

export function startDisplayContext(assembleHook: AssembleHook) {
  // Without a window (e.g. in a Web Worker), `viewport` stays undefined and events have no display.
  let viewport: ViewportDimension | undefined
  // Use requestAnimationFrame to delay the calculation of viewport dimensions until after SDK initialization, preventing long tasks.
  const animationFrameId = globalObject.window?.requestAnimationFrame?.(
    monitor(() => {
      viewport = getViewportDimension()
    })
  )

  const unsubscribeViewport = initViewportObservable().subscribe((viewportDimension) => {
    viewport = viewportDimension
  }).unsubscribe

  assembleHook.register(({ eventType }): DefaultRumEventAttributes => ({
    type: eventType,
    display: viewport ? { viewport } : undefined,
  }))

  return {
    stop: () => {
      unsubscribeViewport()
      if (animationFrameId) {
        globalObject.window?.cancelAnimationFrame(animationFrameId)
      }
    },
  }
}
