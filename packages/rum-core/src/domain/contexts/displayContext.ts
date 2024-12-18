import type { RumConfiguration } from '../configuration'
import type { ViewportDimension } from '../../browser/viewportObservable'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'

export type DisplayContext = ReturnType<typeof startDisplayContext>

export function startDisplayContext(configuration: RumConfiguration) {
  let viewport: ViewportDimension | undefined

  // Use requestAnimationFrame to delay the calculation of viewport dimensions until after SDK initialization, preventing long tasks.
  const animationFrameId = requestAnimationFrame(() => {
    viewport = getViewportDimension()
  })

  const unsubscribeViewport = initViewportObservable(configuration).subscribe((viewportDimension) => {
    viewport = viewportDimension
  }).unsubscribe

  return {
    get: () => (viewport ? { viewport } : undefined),
    stop: () => {
      unsubscribeViewport()
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    },
  }
}
