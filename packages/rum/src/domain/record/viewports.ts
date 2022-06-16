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
function isVisualViewportFactoredIn() {
  const visual = window.visualViewport
  return (
    Math.abs(visual.pageTop - visual.offsetTop - window.scrollY) > TOLERANCE ||
    Math.abs(visual.pageLeft - visual.offsetLeft - window.scrollX) > TOLERANCE
  )
}

interface LayoutCoordinates {
  layoutViewportX: number
  layoutViewportY: number
  visualViewportX: number
  visualViewportY: number
}

export const convertMouseEventToLayoutCoordinates = (clientX: number, clientY: number): LayoutCoordinates => {
  const visual = window.visualViewport
  const normalised: LayoutCoordinates = {
    layoutViewportX: clientX,
    layoutViewportY: clientY,
    visualViewportX: clientX,
    visualViewportY: clientY,
  }

  if (!visual) {
    // On old browsers, we cannot normalise, so fallback to clientX/Y
    return normalised
  } else if (isVisualViewportFactoredIn()) {
    // Typically Mobile Devices
    normalised.layoutViewportX = Math.round(clientX + visual.offsetLeft)
    normalised.layoutViewportY = Math.round(clientY + visual.offsetTop)
  } else {
    // Typically Desktop Devices
    normalised.visualViewportX = Math.round(clientX - visual.offsetLeft)
    normalised.visualViewportY = Math.round(clientY - visual.offsetTop)
  }
  return normalised
}

export const getVisualViewport = (): VisualViewportRecord['data'] => {
  const visual = window.visualViewport
  return {
    scale: visual.scale,
    offsetLeft: visual.offsetLeft,
    offsetTop: visual.offsetTop,
    pageLeft: visual.pageLeft,
    pageTop: visual.pageTop,
    height: visual.height,
    width: visual.width,
  }
}

export function getScrollX() {
  const visual = window.visualViewport
  if (visual) {
    return visual.pageLeft - visual.offsetLeft
  }
  if (window.scrollX !== undefined) {
    return window.scrollX
  }
  return window.pageXOffset || 0
}

export function getScrollY() {
  const visual = window.visualViewport
  if (visual) {
    return visual.pageTop - visual.offsetTop
  }
  if (window.scrollY !== undefined) {
    return window.scrollY
  }
  return window.pageYOffset || 0
}
