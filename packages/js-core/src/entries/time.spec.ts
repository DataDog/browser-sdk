import { registerCleanupTask } from '../../../browser-core/test'
import type { TimeStamp } from './time'
import { getTimeOrigin, resetTimeOrigin } from './time'

describe('getTimeOrigin', () => {
  it('floors performance.timeOrigin when performance.timing is unavailable', () => {
    // Without `performance.timing` (e.g. in a Web Worker), the time origin comes from `performance.timeOrigin`, which is fractional
    const originalTiming = performance.timing
    const originalTimeOrigin = performance.timeOrigin
    Object.defineProperty(performance, 'timing', { configurable: true, value: undefined })
    Object.defineProperty(performance, 'timeOrigin', { configurable: true, value: 1730284800123.789 })
    resetTimeOrigin()
    registerCleanupTask(() => {
      Object.defineProperty(performance, 'timing', { configurable: true, value: originalTiming })
      Object.defineProperty(performance, 'timeOrigin', { configurable: true, value: originalTimeOrigin })
      resetTimeOrigin()
    })

    expect(getTimeOrigin()).toBe(1730284800123 as TimeStamp)
  })
})
