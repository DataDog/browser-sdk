import type { RumConfiguration } from '../configuration'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'

export type DisplayContext = ReturnType<typeof startDisplayContext>

export function startDisplayContext(configuration: RumConfiguration) {
  let viewport = getViewportDimension()
  const unsubscribeViewport = initViewportObservable(configuration).subscribe((viewportDimension) => {
    viewport = viewportDimension
  }).unsubscribe

  return {
    get: () => ({ viewport }),
    stop: unsubscribeViewport,
  }
}
