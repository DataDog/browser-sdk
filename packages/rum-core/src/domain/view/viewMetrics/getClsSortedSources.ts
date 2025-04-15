import type { RumLayoutShiftAttribution } from '../../../browser/performanceObservable'

/**
 * Calculates the area of a rectangle given its width and height
 */
const calculateArea = (width: number, height: number): number => width * height

/**
 * Calculates the intersection area between two rectangles
 */
const calculateIntersectionArea = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number => {
  const left = Math.max(rect1.x, rect2.x)
  const top = Math.max(rect1.y, rect2.y)
  const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width)
  const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height)

  if (left >= right || top >= bottom) {
    return 0
  }

  return calculateArea(right - left, bottom - top)
}

/**
 * Calculates the total impacted area of a layout shift source
 * This is the sum of the previous and current areas minus their intersection
 */
const getImpactedArea = (source: RumLayoutShiftAttribution): number => {
  const previousArea = calculateArea(source.previousRect.width, source.previousRect.height)
  const currentArea = calculateArea(source.currentRect.width, source.currentRect.height)
  const intersectionArea = calculateIntersectionArea(source.previousRect, source.currentRect)

  return previousArea + currentArea - intersectionArea
}

/**
 * Sorts layout shift sources by their impacted area in descending order
 * @returns A new sorted array of layout shift sources
 */
export function getClsSortedSources(sources: RumLayoutShiftAttribution[]): RumLayoutShiftAttribution[] {
  if (!sources.length) {
    return sources
  }

  // Create a new array with sources and their pre-calculated impacted areas
  const sourcesWithImpactedAreas = sources.map((source) => ({
    source,
    impactedArea: getImpactedArea(source),
  }))

  // Sort by impacted area in descending order
  sourcesWithImpactedAreas.sort((a, b) => b.impactedArea - a.impactedArea)

  // Return just the sorted sources
  return sourcesWithImpactedAreas.map(({ source }) => source)
}
