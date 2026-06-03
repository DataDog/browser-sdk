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

import type { VisualViewportRecord } from '../../types'

// Scrollbar widths vary across properties on different devices and browsers
const TOLERANCE = 25

/**
 * Use the Visual Viewport API's properties to measure scrollX/Y in reference to the layout viewport
 * in order to determine if window.scrollX/Y is measuring the layout or visual viewport.
 * This finding corresponds to which viewport mouseEvent.clientX/Y and window.innerWidth/Height measures.
 */
function isVisualViewportFactoredIn(visualViewport: VisualViewport) {
  return (
    Math.abs(visualViewport.pageTop - visualViewport.offsetTop - window.scrollY) > TOLERANCE ||
    Math.abs(visualViewport.pageLeft - visualViewport.offsetLeft - window.scrollX) > TOLERANCE
  )
}

interface LayoutCoordinates {
  layoutViewportX: number
  layoutViewportY: number
  visualViewportX: number
  visualViewportY: number
}

export const convertMouseEventToLayoutCoordinates = (clientX: number, clientY: number): LayoutCoordinates => {
  const visualViewport = window.visualViewport
  const normalized: LayoutCoordinates = {
    layoutViewportX: clientX,
    layoutViewportY: clientY,
    visualViewportX: clientX,
    visualViewportY: clientY,
  }

  if (!visualViewport) {
    // On old browsers, we cannot normalize, so fallback to clientX/Y
    return normalized
  } else if (isVisualViewportFactoredIn(visualViewport)) {
    // Typically Mobile Devices
    normalized.layoutViewportX = Math.round(clientX + visualViewport.offsetLeft)
    normalized.layoutViewportY = Math.round(clientY + visualViewport.offsetTop)
  } else {
    // Typically Desktop Devices
    normalized.visualViewportX = Math.round(clientX - visualViewport.offsetLeft)
    normalized.visualViewportY = Math.round(clientY - visualViewport.offsetTop)
  }
  return normalized
}

export const getVisualViewport = (visualViewport: VisualViewport): VisualViewportRecord['data'] => ({
  scale: visualViewport.scale,
  offsetLeft: visualViewport.offsetLeft,
  offsetTop: visualViewport.offsetTop,
  pageLeft: visualViewport.pageLeft,
  pageTop: visualViewport.pageTop,
  height: visualViewport.height,
  width: visualViewport.width,
})
