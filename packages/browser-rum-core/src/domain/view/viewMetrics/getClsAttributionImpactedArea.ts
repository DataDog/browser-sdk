import type { RumLayoutShiftAttribution } from '../../../browser/performanceObservable'

/**
 * Calculates the area of a rectangle given its width and height
 */
const calculateArea = (width: number, height: number): number => width * height

/**
 * Calculates the intersection area between two rectangles
 */
const calculateIntersectionArea = (rect1: DOMRectReadOnly, rect2: DOMRectReadOnly): number => {
  const left = Math.max(rect1.left, rect2.left)
  const top = Math.max(rect1.top, rect2.top)
  const right = Math.min(rect1.right, rect2.right)
  const bottom = Math.min(rect1.bottom, rect2.bottom)

  if (left >= right || top >= bottom) {
    return 0
  }

  return calculateArea(right - left, bottom - top)
}

/**
 * Calculates the total impacted area of a layout shift source
 * This is the sum of the previous and current areas minus their intersection
 */
export const getClsAttributionImpactedArea = (source: RumLayoutShiftAttribution): number => {
  const previousArea = calculateArea(source.previousRect.width, source.previousRect.height)
  const currentArea = calculateArea(source.currentRect.width, source.currentRect.height)
  const intersectionArea = calculateIntersectionArea(source.previousRect, source.currentRect)

  return previousArea + currentArea - intersectionArea
}
