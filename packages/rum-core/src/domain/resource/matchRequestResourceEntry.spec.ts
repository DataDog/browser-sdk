import type { Duration, RelativeTime } from '@datadog/browser-core'
import { ExperimentalFeature, isIE, relativeToClocks } from '@datadog/browser-core'
import { mockExperimentalFeatures } from '@datadog/browser-core/test'
import type { GlobalPerformanceBufferMock } from '../../../test'
import { createPerformanceEntry, mockGlobalPerformanceBuffer } from '../../../test'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RequestCompleteEvent } from '../requestCollection'

import { matchRequestResourceEntry } from './matchRequestResourceEntry'

describe('matchRequestResourceEntry', () => {
  const FAKE_URL = 'https://example.com'
  const FAKE_REQUEST: Partial<RequestCompleteEvent> = {
    url: FAKE_URL,
    startClocks: relativeToClocks(100 as RelativeTime),
    duration: 500 as Duration,
  }
  let globalPerformanceObjectMock: GlobalPerformanceBufferMock

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    globalPerformanceObjectMock = mockGlobalPerformanceBuffer()
  })

  it('should match single entry nested in the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 200 as RelativeTime,
      duration: 300 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(entry.toJSON() as RumPerformanceResourceTiming)
  })

  it('should match single entry nested in the request with error margin', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 99 as RelativeTime,
      duration: 502 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(entry.toJSON() as RumPerformanceResourceTiming)
  })

  it('should not match single entry outside the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 0 as RelativeTime,
      duration: 300 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should discard already matched entries when multiple identical requests are done conurently', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 200 as RelativeTime,
      duration: 300 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry1)

    const matchingEntry1 = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry1).toEqual(entry1.toJSON() as RumPerformanceResourceTiming)

    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 99 as RelativeTime,
      duration: 502 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry2)

    const matchingEntry2 = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry2).toEqual(entry2.toJSON() as RumPerformanceResourceTiming)
  })

  it('should not match two not following entries nested in the request ', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 150 as RelativeTime,
      duration: 100 as Duration,
    })
    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 200 as RelativeTime,
      duration: 100 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry1)
    globalPerformanceObjectMock.addPerformanceEntry(entry2)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should not match multiple entries nested in the request', () => {
    const entry1 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 100 as RelativeTime,
      duration: 50 as Duration,
    })
    const entry2 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 150 as RelativeTime,
      duration: 50 as Duration,
    })
    const entry3 = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      startTime: 200 as RelativeTime,
      duration: 50 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry1)
    globalPerformanceObjectMock.addPerformanceEntry(entry2)
    globalPerformanceObjectMock.addPerformanceEntry(entry3)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('should not match entry with invalid duration', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      duration: -1 as Duration,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('[without tolerant_resource_timings] should not match invalid entry nested in the request ', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      // fetchStart < startTime is invalid
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })
    globalPerformanceObjectMock.addPerformanceEntry(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toEqual(undefined)
  })

  it('[with tolerant_resource_timings] should match invalid entry nested in the request ', () => {
    mockExperimentalFeatures([ExperimentalFeature.TOLERANT_RESOURCE_TIMINGS])
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      name: FAKE_URL,
      // fetchStart < startTime is invalid
      fetchStart: 0 as RelativeTime,
      startTime: 200 as RelativeTime,
    })

    globalPerformanceObjectMock.addPerformanceEntry(entry)

    const matchingEntry = matchRequestResourceEntry(FAKE_REQUEST as RequestCompleteEvent)

    expect(matchingEntry).toBeDefined()
  })
})
