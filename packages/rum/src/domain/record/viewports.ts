/**
 * Browsers have not standardized various dimension properties. Mobile devices typically report
 * dimensions in reference to the visual viewport, while desktop uses the layout viewport. For example,
 * Mobile Chrome will change innerWidth when a pinch zoom takes place, while Chrome Desktop (mac) will not.
 *
 * With the new Viewport API, we now calculate and normalize dimension properties to the layout viewport.
 * If the VisualViewport API is not supported by a browser, it isn't reasonably possible to detect or normalize
 * which viewport is being measured. Therefore these exported functions will fallback to assuming that the layout
 * viewport is being measured by the browser
 */

// Scrollbar widths vary across properties on different devices and browsers
const TOLERANCE = 10

const isVisualViewportFactoredIn = () =>
  Math.abs(visualViewport.pageTop - visualViewport.offsetTop - window.scrollY) > TOLERANCE ||
  Math.abs(visualViewport.pageLeft - visualViewport.offsetLeft - window.scrollX) > TOLERANCE

export const getLayoutViewportDimensions = () => {
  if (!visualViewport || !isVisualViewportFactoredIn()) {
    return {
      innerWidth,
      innerHeight,
      scrollX,
      scrollY,
    }
  }
  return {
    innerWidth: visualViewport.width * visualViewport.scale,
    innerHeight: visualViewport.height * visualViewport.scale,
    scrollX: scrollX - visualViewport.pageLeft,
    scrollY: scrollY - visualViewport.pageTop,
  }
}

export const convertMouseEventToLayoutCoordinates = (mouseEvent: MouseEvent) => {
  if (isVisualViewportFactoredIn()) {
    return {
      layoutViewportX: mouseEvent.clientX + visualViewport.offsetLeft,
      layoutViewportY: mouseEvent.clientY + visualViewport.offsetTop,
      visualViewportX: mouseEvent.clientX,
      visualViewportY: mouseEvent.clientY,
    }
  }
  return {
    layoutViewportX: mouseEvent.clientX,
    layoutViewportY: mouseEvent.clientY,
    visualViewportX: mouseEvent.clientX - visualViewport.offsetLeft,
    visualViewportY: mouseEvent.clientY - visualViewport.offsetTop,
  }
}
