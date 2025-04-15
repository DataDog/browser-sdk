import type { RumLayoutShiftAttribution } from '../../../browser/performanceObservable'
import { getClsAttributionImpactedArea } from './getClsAttributionImpactedArea'

describe('getClsAttributionImpactedArea', () => {
  it('should calculate the impacted area when rectangles do not overlap', () => {
    const source: RumLayoutShiftAttribution = {
      node: null,
      previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
      currentRect: DOMRectReadOnly.fromRect({ x: 20, y: 20, width: 10, height: 10 }),
    }

    expect(getClsAttributionImpactedArea(source)).toBe(200) // 100 (previous) + 100 (current) - 0 (intersection)
  })

  it('should calculate the impacted area when rectangles partially overlap', () => {
    const source: RumLayoutShiftAttribution = {
      node: null,
      previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
      currentRect: DOMRectReadOnly.fromRect({ x: 5, y: 5, width: 10, height: 10 }),
    }

    /*
              Visual representation:
              Previous & current rects (10x10):
              +---------+
              |         |                     Intersection area (5x5):
              |    +----+----+                 +----+
              |    |    |    |                 |    |
              +----+----+    |                 +----+
                   |         |
                   +---------+
              */

    expect(getClsAttributionImpactedArea(source)).toBe(175) // 100 (previous) + 100 (current) - 25 (intersection)
  })

  it('should calculate the impacted area when rectangles completely overlap', () => {
    const source: RumLayoutShiftAttribution = {
      node: null,
      previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
      currentRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    }
    /*
               Visual representation:
               Previous & current rects (10x10):
                  +---------+
                  |         |
                  |         |
                  |         |
                  +----+----+
                  and also intersection area (10x10)      
               */
    expect(getClsAttributionImpactedArea(source)).toBe(100) // 100 (previous) + 100 (current) - 100 (intersection)
  })

  it('should calculate the impacted area when rectangles are adjacent', () => {
    const source: RumLayoutShiftAttribution = {
      node: null,
      previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
      currentRect: DOMRectReadOnly.fromRect({ x: 10, y: 0, width: 10, height: 10 }),
    }

    expect(getClsAttributionImpactedArea(source)).toBe(200) // 100 (previous) + 100 (current) - 0 (intersection)
  })

  it('should calculate the impacted area for different sized rectangles', () => {
    const source: RumLayoutShiftAttribution = {
      node: null,
      previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 5, height: 5 }),
      currentRect: DOMRectReadOnly.fromRect({ x: 2, y: 2, width: 10, height: 10 }),
    }

    /*
        Visual representation:
        Previous rect (5x5):
        +---------+
        |         |                     Intersection area (3x3):
        |    +----+----------+                 +----+
        |    |    |          |                 |    |
        +----+----+          |                 +----+
             |               |
             |               |
             |               |
             +--------------+
           Current rect (10x10):          
        */
    expect(getClsAttributionImpactedArea(source)).toBe(116) // 25 (previous) + 100 (current) - 9 (intersection)
  })

  it('should handle rectangles with zero dimensions', () => {
    const source: RumLayoutShiftAttribution = {
      node: null,
      previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 0, height: 0 }),
      currentRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
    }

    expect(getClsAttributionImpactedArea(source)).toBe(100) // 0 (previous) + 100 (current) - 0 (intersection)
  })
})
