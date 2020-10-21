import { isIE } from '@datadog/browser-core'
import { RumPerformanceResourceTiming } from '../../../browser/performanceCollection'
import { RequestCompleteEvent } from '../../requestCollection'

import { matchRequestTiming } from './matchRequestTiming'

describe('matchRequestTiming', () => {
  const FAKE_REQUEST: Partial<RequestCompleteEvent> = { startTime: 100, duration: 500 }
  let entries: RumPerformanceResourceTiming[]

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    entries = []
    spyOn(performance, 'getEntriesByName').and.returnValues(entries as PerformanceResourceTiming[])
  })

  it('should match single timing nested in the request ', () => {
    const match: Partial<RumPerformanceResourceTiming> = { startTime: 200, duration: 300 }
    entries.push(match as RumPerformanceResourceTiming)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(match as RumPerformanceResourceTiming)
  })

  it('should not match single timing outside the request ', () => {
    const match: Partial<RumPerformanceResourceTiming> = { startTime: 0, duration: 300 }
    entries.push(match as RumPerformanceResourceTiming)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should match two following timings nested in the request ', () => {
    const optionsTiming: Partial<RumPerformanceResourceTiming> = { startTime: 200, duration: 50 }
    const actualTiming: Partial<RumPerformanceResourceTiming> = { startTime: 300, duration: 100 }
    entries.push(optionsTiming as RumPerformanceResourceTiming, actualTiming as RumPerformanceResourceTiming)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(actualTiming as RumPerformanceResourceTiming)
  })

  it('should not match two not following timings nested in the request ', () => {
    const match1: Partial<RumPerformanceResourceTiming> = { startTime: 200, duration: 100 }
    const match2: Partial<RumPerformanceResourceTiming> = { startTime: 250, duration: 100 }
    entries.push(match1 as RumPerformanceResourceTiming, match2 as RumPerformanceResourceTiming)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should not match multiple timings nested in the request', () => {
    const match1: Partial<RumPerformanceResourceTiming> = { startTime: 100, duration: 100 }
    const match2: Partial<RumPerformanceResourceTiming> = { startTime: 200, duration: 100 }
    const match3: Partial<RumPerformanceResourceTiming> = { startTime: 300, duration: 100 }
    entries.push(
      match1 as RumPerformanceResourceTiming,
      match2 as RumPerformanceResourceTiming,
      match3 as RumPerformanceResourceTiming
    )

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })
})
