import { addTelemetryDebug } from '@datadog/browser-core'

export type ElementsScrollPositions = ReturnType<typeof createElementsScrollPositions>
export type ScrollPositions = { scrollLeft: number; scrollTop: number }

export function createElementsScrollPositions() {
  const scrollPositionsByElement = new WeakMap<Element, ScrollPositions>()
  let documentScrollingElement: Element | null
  return {
    set(element: Element | Document, scrollPositions: ScrollPositions) {
      if (element === document && !documentScrollingElement) {
        documentScrollingElement = tryToFindScrollingElement(scrollPositions)
        if (!documentScrollingElement) {
          return
        }
      }
      try {
        scrollPositionsByElement.set(
          element === document ? documentScrollingElement! : (element as Element),
          scrollPositions
        )
      } catch (e) {
        addTelemetryDebug(`invalid element: ${String(element)}`)
      }
    },
    get(element: Element) {
      return scrollPositionsByElement.get(element)
    },
    has(element: Element) {
      return scrollPositionsByElement.has(element)
    },
  }
}

function tryToFindScrollingElement(scrollPositions: ScrollPositions) {
  if (document.scrollingElement) {
    return document.scrollingElement
  }
  addTelemetryDebug('null document scrolling element')
  if (scrollPositions.scrollLeft === 0 && scrollPositions.scrollTop === 0) {
    addTelemetryDebug('Unable to find scrolling element for scroll (0,0)')
    return null
  }
  if (
    Math.round(document.documentElement.scrollLeft) === scrollPositions.scrollLeft &&
    Math.round(document.documentElement.scrollTop) === scrollPositions.scrollTop
  ) {
    return document.documentElement
  }
  addTelemetryDebug('Unable to find scrolling element')
  return null
}
