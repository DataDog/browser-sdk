import { addTelemetryDebug } from '@datadog/browser-core'
import { forEach } from './utils'

export type ElementsScrollPositions = ReturnType<typeof createElementsScrollPositions>
export type ScrollPositions = { scrollLeft: number; scrollTop: number }

export function createElementsScrollPositions() {
  const scrollPositionsByElement = new WeakMap<Element, ScrollPositions>()
  let documentScrollingElement = document.scrollingElement
  return {
    set(element: Element | Document, scrollPositions: ScrollPositions) {
      if (element === document && !documentScrollingElement) {
        documentScrollingElement = findDocumentScrollingElement(document.childNodes, scrollPositions)
        if (!documentScrollingElement) {
          addTelemetryDebug('unable to find document scrolling element')
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

function findDocumentScrollingElement(childNodes: NodeList, scrollPositions: ScrollPositions) {
  let scrollingElement: Element | null = null
  forEach(childNodes, (node) => {
    if (!scrollingElement && node.nodeType === node.ELEMENT_NODE) {
      const element = node as Element
      if (
        Math.round(element.scrollTop) === scrollPositions.scrollTop &&
        Math.round(element.scrollLeft) === scrollPositions.scrollLeft
      ) {
        scrollingElement = element
      } else {
        findDocumentScrollingElement(element.childNodes, scrollPositions)
      }
    }
  })
  return scrollingElement
}
