import { isIE } from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
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
    const match = createResourceEntry({ startTime: 200, duration: 300 })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(match)
  })

  it('should not match single timing outside the request ', () => {
    const match = createResourceEntry({ startTime: 0, duration: 300 })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should match two following timings nested in the request ', () => {
    const optionsTiming = createResourceEntry({ startTime: 150, duration: 50 })
    const actualTiming = createResourceEntry({ startTime: 200, duration: 100 })
    entries.push(optionsTiming, actualTiming)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(actualTiming)
  })

  it('should not match two not following timings nested in the request ', () => {
    const match1 = createResourceEntry({ startTime: 150, duration: 100 })
    const match2 = createResourceEntry({ startTime: 200, duration: 100 })
    entries.push(match1, match2)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should not match multiple timings nested in the request', () => {
    const match1 = createResourceEntry({ startTime: 100, duration: 50 })
    const match2 = createResourceEntry({ startTime: 150, duration: 50 })
    const match3 = createResourceEntry({ startTime: 200, duration: 50 })
    entries.push(match1, match2, match3)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })

  it('should match invalid timing nested in the request ', () => {
    const match = createResourceEntry({
      duration: 100,
      fetchStart: 0,
      startTime: 200,
    })
    entries.push(match)

    const timing = matchRequestTiming(FAKE_REQUEST as RequestCompleteEvent)

    expect(timing).toEqual(undefined)
  })
})
