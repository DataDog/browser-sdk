import { monitor } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { ViewportDimension } from '../../browser/viewportObservable'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'
import type { AssembleHook, DefaultRumEventAttributes } from '../hooks'

export type DisplayContext = ReturnType<typeof startDisplayContext>

export function startDisplayContext(assembleHook: AssembleHook, configuration: RumConfiguration) {
  let viewport: ViewportDimension | undefined
  // Use requestAnimationFrame to delay the calculation of viewport dimensions until after SDK initialization, preventing long tasks.
  const animationFrameId = requestAnimationFrame(
    monitor(() => {
      viewport = getViewportDimension()
    })
  )

  const unsubscribeViewport = initViewportObservable(configuration).subscribe((viewportDimension) => {
    viewport = viewportDimension
  }).unsubscribe

  assembleHook.register(
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      display: viewport ? { viewport } : undefined,
    })
  )

  return {
    stop: () => {
      unsubscribeViewport()
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    },
  }
}
