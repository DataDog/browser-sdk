import { replaceMockable } from '../../../browser-core/test'
import type { TimeStamp } from './time'
import { clocksOrigin, getTimeOrigin } from './time'

describe('clocksOrigin', () => {
  it('rounds a fractional time origin to an integer timestamp', () => {
    // Without `performance.timing` (e.g. in a Web Worker), the time origin comes from `performance.timeOrigin`, which is fractional
    replaceMockable(getTimeOrigin, () => 1730284800123.456 as TimeStamp)

    expect(clocksOrigin().timeStamp).toBe(1730284800123 as TimeStamp)
  })
})
