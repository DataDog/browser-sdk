import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { isIE, relativeToClocks, RequestType } from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
import type { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import type { RequestCompleteEvent } from '../../requestCollection'
import { stubPerformanceObserver, createCompletedRequest } from '../../../../test/specHelper'

import {
  matchOnPerformanceGetEntriesByName,
  matchOnPerformanceObserverCallback,
} from './matchResponseToPerformanceEntry'

describe('matchResponseToPerformanceEntry', () => {
  describe('matchOnPerformanceGetEntriesByName', () => {
    const FAKE_REQUEST: Partial<RequestCompleteEvent> = {
      startClocks: relativeToClocks(100 as RelativeTime),
      duration: 500 as Duration,
    }
    let entries: RumPerformanceResourceTiming[]

    beforeEach(() => {
      if (isIE()) {
        pending('no fetch and PerformanceObserver support')
      }
      entries = []
      spyOn(performance, 'getEntriesByName').and.returnValues(entries as unknown as PerformanceResourceTiming[])
    })

    it('should match single timing nested in the request ', () => {
      const match = createResourceEntry({ startTime: 200 as RelativeTime, duration: 300 as Duration })
      entries.push(match)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(match)
    })

    it('should match single timing nested in the request with error margin', () => {
      const match = createResourceEntry({ startTime: 99 as RelativeTime, duration: 502 as Duration })
      entries.push(match)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(match)
    })

    it('should not match single timing outside the request ', () => {
      const match = createResourceEntry({ startTime: 0 as RelativeTime, duration: 300 as Duration })
      entries.push(match)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(undefined)
    })

    it('should match two following timings nested in the request ', () => {
      const optionsTiming = createResourceEntry({ startTime: 150 as RelativeTime, duration: 50 as Duration })
      const actualTiming = createResourceEntry({ startTime: 200 as RelativeTime, duration: 100 as Duration })
      entries.push(optionsTiming, actualTiming)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(actualTiming)
    })

    it('should not match two not following timings nested in the request ', () => {
      const match1 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })
      const match2 = createResourceEntry({ startTime: 200 as RelativeTime, duration: 100 as Duration })
      entries.push(match1, match2)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(undefined)
    })

    it('should not match multiple timings nested in the request', () => {
      const match1 = createResourceEntry({ startTime: 100 as RelativeTime, duration: 50 as Duration })
      const match2 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 50 as Duration })
      const match3 = createResourceEntry({ startTime: 200 as RelativeTime, duration: 50 as Duration })
      entries.push(match1, match2, match3)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(undefined)
    })

    it('should not match invalid timing nested in the request ', () => {
      const match = createResourceEntry({
        duration: 100 as Duration,
        fetchStart: 0 as RelativeTime,
        startTime: 200 as RelativeTime,
      })
      entries.push(match)

      const timing = matchOnPerformanceGetEntriesByName(FAKE_REQUEST as RequestCompleteEvent)

      expect(timing).toEqual(undefined)
    })
  })

  describe('matchOnPerformanceObserverCallback', () => {
    let entries: RumPerformanceResourceTiming[]

    beforeEach(() => {
      if (isIE()) {
        pending('no full rum support')
      }
      entries = []
      spyOn(performance, 'getEntriesByName').and.returnValues(entries as unknown as PerformanceResourceTiming[])
    })

    it('should match single timing nested in the request', (done) => {
      const entry = createResourceEntry({ startTime: 200 as RelativeTime, duration: 100 as Duration })
      const { clear } = stubPerformanceObserver([entry])

      const response = new Response()
      const completedRequest = createCompletedRequest({
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 200 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
      })

      matchOnPerformanceObserverCallback(completedRequest)
        .then((performanceEntry) => {
          expect(performanceEntry).toEqual(entry)
          clear()
          done()
        })
        .catch(() => {
          clear()
          done.fail()
        })
    })

    it('should match two following timings nested in the request', async () => {
      const optionsEntry = createResourceEntry({ startTime: 100 as RelativeTime, duration: 50 as Duration })
      const actualEntry = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })

      const { clear } = stubPerformanceObserver([optionsEntry, actualEntry])

      const response = new Response()
      const completedRequest = createCompletedRequest({
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 150 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
      })

      const performanceEntry = await matchOnPerformanceObserverCallback(completedRequest)

      expect(performanceEntry).toEqual(actualEntry)
      clear()
    })

    it('should not match multiple timings nested in the request', async () => {
      const entry1 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })
      const entry2 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })
      const entry3 = createResourceEntry({ startTime: 150 as RelativeTime, duration: 100 as Duration })

      const { clear } = stubPerformanceObserver([entry1, entry2, entry3])

      const response = new Response()
      const completedRequest = createCompletedRequest({
        duration: 100 as Duration,
        method: 'GET',
        startClocks: { relative: 150 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        status: 200,
        type: RequestType.FETCH,
        url: 'https://resource.com/valid',
        response,
        input: 'https://resource.com/valid',
        init: { headers: { foo: 'bar' } },
      })

      const performanceEntry = await matchOnPerformanceObserverCallback(completedRequest)

      expect(performanceEntry).toBeUndefined()
      clear()
    })
  })
})
