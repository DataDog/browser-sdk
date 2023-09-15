import type { Duration, RelativeTime } from '@datadog/browser-core'
import { isIE, relativeToClocks } from '@datadog/browser-core'
import { createPerformanceEntry } from '../../../test'
import type { RumPerformanceResourceTiming } from '../../browser/performanceCollection'
import { RumPerformanceEntryType } from '../../browser/performanceCollection'
import type { RequestCompleteEvent } from '../requestCollection'

import { matchRequestTiming } from './matchRequestTiming'

describe('matchRequestTiming', () => {
  const FAKE_REQUEST: Partial<RequestCompleteEvent> = {
    startClocks: relativeToClocks(100 as RelativeTime),
    duration: 500 as Duration,
  }
  let entries: PerformanceResourceTiming[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    entries = []
    spyOn(performance, 'getEntriesByName').and.returnValues(entries as unknown as PerformanceResourceTiming[])
  })

  it('should match single timing nested in the request ', () => {
    const entry = createResourceEntry({ startTime: 200 as RelativeTime, duration: 300 as Duration })
    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(entry.toJSON())
  })

  it('should match single timing nested in the request with error margin', () => {
    const entry = createResourceEntry({ startTime: 99 as RelativeTime, duration: 502 as Duration })
    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(entry.toJSON())
  })

  it('should not match single timing outside the request ', () => {
    const entry = createResourceEntry({ startTime: 0 as RelativeTime, duration: 300 as Duration })
    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('should not match two not following timings nested in the request ', () => {
    const entry1 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })
    const entry2 = createResourceEntry({ startTime: 200 as RelativeTime, duration: 100 as Duration })
    entries.push(entry1, entry2)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('should not match multiple timings nested in the request', () => {
    const entry1 = createResourceEntry({ startTime: 100 as RelativeTime, duration: 50 as Duration })
    const entry2 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 50 as Duration })
    const entry3 = createResourceEntry({ startTime: 200 as RelativeTime, duration: 50 as Duration })
    entries.push(entry1, entry2, entry3)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('should not match invalid timing nested in the request ', () => {
    const entry = createResourceEntry({
      // fetchStart < startTime is invalid
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })

    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })
})

export function createResourceEntry(overrides?: Partial<RumPerformanceResourceTiming>): PerformanceResourceTiming {
  const rumPerformanceResourceTiming: Partial<PerformanceResourceTiming> = createPerformanceEntry(
    RumPerformanceEntryType.RESOURCE,
    overrides
  )
  return {
    ...rumPerformanceResourceTiming,
    toJSON: () => rumPerformanceResourceTiming,
  } as PerformanceResourceTiming
}
