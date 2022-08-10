import { addTelemetryDebug } from '@datadog/browser-core'

export type ElementsScrollPositions = ReturnType<typeof createElementsScrollPositions>
export type ScrollPositions = { scrollLeft: number; scrollTop: number }

export function createElementsScrollPositions() {
  const scrollPositionsByElement = new WeakMap<Element, ScrollPositions>()
  const documentScrollingElement = document.scrollingElement!
  if (!documentScrollingElement) {
    addTelemetryDebug('document without scrollingElement')
  }
  return {
    set(element: Element | Document, scrollPositions: ScrollPositions) {
      scrollPositionsByElement.set(
        element === document ? documentScrollingElement : (element as Element),
        scrollPositions
      )
    },
    get(element: Element) {
      return scrollPositionsByElement.get(element)
    },
    has(element: Element) {
      return scrollPositionsByElement.has(element)
    },
  }
}
