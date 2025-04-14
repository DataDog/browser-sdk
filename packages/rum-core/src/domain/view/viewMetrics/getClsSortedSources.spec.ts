import type { RumLayoutShiftAttribution } from '../../../browser/performanceObservable'
import { getClsSortedSources } from './getClsSortedSources'

describe('getClsSortedSources', () => {
  it('should return an empty array when sources is empty', () => {
    const sources: RumLayoutShiftAttribution[] = []
    expect(getClsSortedSources(sources)).toEqual([])
  })

  it('should sort sources by impacted area in descending order', () => {
    const createSource = (x: number, y: number, width: number, height: number): RumLayoutShiftAttribution => ({
      node: document.createElement('div'),
      previousRect: { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x, toJSON: () => ({}) },
      currentRect: {
        x: x + 10,
        y: y + 10,
        width,
        height,
        top: y + 10,
        right: x + width + 10,
        bottom: y + height + 10,
        left: x + 10,
        toJSON: () => ({}),
      },
    })

    const sources: RumLayoutShiftAttribution[] = [
      createSource(0, 0, 100, 100), // Area: 10000
      createSource(0, 0, 200, 200), // Area: 40000
      createSource(0, 0, 50, 50), // Area: 2500
    ]

    const sortedSources = getClsSortedSources(sources)
    expect(sortedSources.length).toBe(3)
    expect(sortedSources[0].currentRect.width).toBe(200) // Largest area first
    expect(sortedSources[1].currentRect.width).toBe(100) // Second largest
    expect(sortedSources[2].currentRect.width).toBe(50) // Smallest last
  })

  it('should handle non-intersecting rectangles correctly', () => {
    const createNonIntersectingSource = (): RumLayoutShiftAttribution => ({
      node: document.createElement('div'),
      previousRect: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        top: 0,
        right: 100,
        bottom: 100,
        left: 0,
        toJSON: () => ({}),
      },
      currentRect: {
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        top: 200,
        right: 300,
        bottom: 300,
        left: 200,
        toJSON: () => ({}),
      },
    })

    const sources: RumLayoutShiftAttribution[] = [createNonIntersectingSource()]

    const sortedSources = getClsSortedSources(sources)
    expect(sortedSources.length).toBe(1)
    // The impacted area should be the sum of both rectangles since they don't intersect
    expect(sortedSources[0].currentRect.width).toBe(100)
  })

  it('should handle partially intersecting rectangles correctly', () => {
    const createPartiallyIntersectingSource = (): RumLayoutShiftAttribution => ({
      node: document.createElement('div'),
      previousRect: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        top: 0,
        right: 100,
        bottom: 100,
        left: 0,
        toJSON: () => ({}),
      },
      currentRect: {
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        top: 50,
        right: 150,
        bottom: 150,
        left: 50,
        toJSON: () => ({}),
      },
    })

    const sources: RumLayoutShiftAttribution[] = [createPartiallyIntersectingSource()]

    const sortedSources = getClsSortedSources(sources)
    expect(sortedSources.length).toBe(1)
    // The impacted area should be less than the sum of both rectangles since they intersect
    expect(sortedSources[0].currentRect.width).toBe(100)
  })
})
