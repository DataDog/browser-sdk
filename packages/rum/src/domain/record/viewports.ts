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
  if (!window.visualViewport || !isVisualViewportFactoredIn()) {
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

interface LayoutCoordinates {
  layoutViewportX: number
  layoutViewportY: number
  visualViewportX: number | null
  visualViewportY: number | null
}

export const convertMouseEventToLayoutCoordinates = (mouseEvent: MouseEvent): LayoutCoordinates => {
  const normalised: LayoutCoordinates = {
    layoutViewportX: mouseEvent.clientX,
    layoutViewportY: mouseEvent.clientY,
    visualViewportX: mouseEvent.clientX,
    visualViewportY: mouseEvent.clientY,
  }

  if (!window.visualViewport) {
    // Unable to normalise
    normalised.visualViewportX = null
    normalised.visualViewportY = null
  } else if (isVisualViewportFactoredIn()) {
    normalised.layoutViewportX + visualViewport.offsetLeft
    normalised.layoutViewportY + visualViewport.offsetTop
  } else {
    normalised.visualViewportX! - visualViewport.offsetLeft
    normalised.visualViewportY! - visualViewport.offsetTop
  }
  return normalised
}
