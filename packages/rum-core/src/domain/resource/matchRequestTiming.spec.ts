import type { Duration, RelativeTime } from '@datadog/browser-core'
import { ExperimentalFeature, isIE, relativeToClocks } from '@datadog/browser-core'
import { mockExperimentalFeatures } from '@datadog/browser-core/test'
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
  let entries: RumPerformanceResourceTiming[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    entries = []
    spyOn(performance, 'getEntriesByName').and.returnValue(entries)
  })

  it('should match single timing nested in the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 300 as Duration,
    })
    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(entry.toJSON() as RumPerformanceResourceTiming)
  })

  it('should match single timing nested in the request with error margin', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 99 as RelativeTime,
      duration: 502 as Duration,
    })
    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(entry.toJSON() as RumPerformanceResourceTiming)
  })

  it('should not match single timing outside the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 0 as RelativeTime,
      duration: 300 as Duration,
    })
    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('should discard already matched timings when multiple identical requests are done conurently', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 300 as Duration,
    })
    entries.push(entry1)

    const matchingTiming1 = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming1).toEqual(entry1.toJSON() as RumPerformanceResourceTiming)

    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 99 as RelativeTime,
      duration: 502 as Duration,
    })
    entries.push(entry2)

    const matchingTiming2 = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming2).toEqual(entry2.toJSON() as RumPerformanceResourceTiming)
  })

  it('should not match two not following timings nested in the request ', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 150 as RelativeTime,
      duration: 100 as Duration,
    })
    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 100 as Duration,
    })
    entries.push(entry1, entry2)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('should not match multiple timings nested in the request', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 100 as RelativeTime,
      duration: 50 as Duration,
    })
    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 150 as RelativeTime,
      duration: 50 as Duration,
    })
    const entry3 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 50 as Duration,
    })
    entries.push(entry1, entry2, entry3)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('[without tolerant_resource_timings] should not match invalid timing nested in the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      // fetchStart < startTime is invalid
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })

    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toEqual(undefined)
  })

  it('[with tolerant_resource_timings] should match invalid timing nested in the request ', () => {
    mockExperimentalFeatures([ExperimentalFeature.TOLERANT_RESOURCE_TIMINGS])
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      // fetchStart < startTime is invalid
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })

    entries.push(entry)

    const matchingTiming = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingTiming).toBeDefined()
  })
})
