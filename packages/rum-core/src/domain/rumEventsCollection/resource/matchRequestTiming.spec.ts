import type { Duration, RelativeTime } from '@datadog/browser-core'
import { isIE, relativeToClocks } from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
import type { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import type { RequestCompleteEvent } from '../../requestCollection'

import { matchRequestTiming } from './matchRequestTiming'

describe('matchRequestTiming', () => {
  const FAKE_REQUEST: Partial<RequestCompleteEvent> = {
    startClocks: relativeToClocks(100 as RelativeTime),
    duration: 500 as Duration,
  }
  let entries: RumPerformanceResourceTiming[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    entries = []
    spyOn(performance, 'getEntriesByName').and.returnValues(entries as unknown as PerformanceResourceTiming[])
  })

  it('should match single timing nested in the request ', () => {
    const match = createResourceEntry({ startTime: 200 as RelativeTime, duration: 300 as Duration })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(match)
  })

  it('should match single timing nested in the request with error margin', () => {
    const match = createResourceEntry({ startTime: 99 as RelativeTime, duration: 502 as Duration })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(match)
  })

  it('should not match single timing outside the request ', () => {
    const match = createResourceEntry({ startTime: 0 as RelativeTime, duration: 300 as Duration })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should not match two not following timings nested in the request ', () => {
    const match1 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })
    const match2 = createResourceEntry({ startTime: 200 as RelativeTime, duration: 100 as Duration })
    entries.push(match1, match2)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should not match multiple timings nested in the request', () => {
    const match1 = createResourceEntry({ startTime: 100 as RelativeTime, duration: 50 as Duration })
    const match2 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 50 as Duration })
    const match3 = createResourceEntry({ startTime: 200 as RelativeTime, duration: 50 as Duration })
    entries.push(match1, match2, match3)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should not match invalid timing nested in the request ', () => {
    const match = createResourceEntry({
      duration: 100 as Duration,
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })
})
