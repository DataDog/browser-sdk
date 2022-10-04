export type ElementsScrollPositions = ReturnType<typeof createElementsScrollPositions>
export type ScrollPositions = { scrollLeft: number; scrollTop: number }

export function createElementsScrollPositions() {
  const scrollPositionsByElement = new WeakMap<Element, ScrollPositions>()
  return {
    set(element: Element | Document, scrollPositions: ScrollPositions) {
      if (element === document && !document.scrollingElement) {
        // cf https://drafts.csswg.org/cssom-view/#dom-document-scrollingelement,
        // in some cases scrolling elements can not be defined, we don't support those for now
        return
      }
      scrollPositionsByElement.set(
        element === document ? document.scrollingElement! : (element as Element),
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
