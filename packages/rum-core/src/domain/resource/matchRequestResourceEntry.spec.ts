import type { Duration, RelativeTime } from '@datadog/browser-core'
import { isIE, relativeToClocks } from '@datadog/browser-core'
import { createPerformanceEntry } from '../../../test'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RequestCompleteEvent } from '../requestCollection'

import { matchRequestResourceEntry } from './matchRequestResourceEntry'

describe('matchRequestResourceEntry', () => {
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

  it('should match single entry nested in the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 300 as Duration,
    })
    entries.push(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(entry.toJSON() as RumPerformanceResourceTiming)
  })

  it('should match single entry nested in the request with error margin', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 99 as RelativeTime,
      duration: 502 as Duration,
    })
    entries.push(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(entry.toJSON() as RumPerformanceResourceTiming)
  })

  it('should not match single entry outside the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 0 as RelativeTime,
      duration: 300 as Duration,
    })
    entries.push(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should discard already matched entries when multiple identical requests are done conurently', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 300 as Duration,
    })
    entries.push(entry1)

    const matchingEntry1 = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry1).toEqual(entry1.toJSON() as RumPerformanceResourceTiming)

    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 99 as RelativeTime,
      duration: 502 as Duration,
    })
    entries.push(entry2)

    const matchingEntry2 = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry2).toEqual(entry2.toJSON() as RumPerformanceResourceTiming)
  })

  it('should not match two not following entries nested in the request ', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 150 as RelativeTime,
      duration: 100 as Duration,
    })
    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      startTime: 200 as RelativeTime,
      duration: 100 as Duration,
    })
    entries.push(entry1, entry2)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should not match multiple entries nested in the request', () => {
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

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should not match entry with invalid duration', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      duration: -1 as Duration,
    })

    entries.push(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should not match invalid entry nested in the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      // fetchStart < startTime is invalid
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })

    entries.push(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })
})
