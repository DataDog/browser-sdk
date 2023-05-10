import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import { resetExperimentalFeatures } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import type { PageStateHistory } from './pageStateHistory'
import { startPageStateHistory, PageState } from './pageStateHistory'

describe('pageStateHistory', () => {
  let pageStateHistory: PageStateHistory
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(() => {
        pageStateHistory = startPageStateHistory()
        return pageStateHistory
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
    pageStateHistory.stop()
    resetExperimentalFeatures()
  })

  it('should have the current state when starting', () => {
    setupBuilder.build()
    expect(pageStateHistory.findAll(0 as RelativeTime, 10 as RelativeTime)).toBeDefined()
  })

  it('should return undefined if the time period is out of history bounds', () => {
    pageStateHistory = startPageStateHistory()
    expect(pageStateHistory.findAll(-10 as RelativeTime, 0 as RelativeTime)).not.toBeDefined()
  })

  it('should return the correct page states for the given time period', () => {
    const { clock } = setupBuilder.build()

    pageStateHistory.addPageState(PageState.ACTIVE)

    clock.tick(10)
    pageStateHistory.addPageState(PageState.PASSIVE)

    clock.tick(10)
    pageStateHistory.addPageState(PageState.HIDDEN)

    clock.tick(10)
    pageStateHistory.addPageState(PageState.FROZEN)

    clock.tick(10)
    pageStateHistory.addPageState(PageState.TERMINATED)

    expect(pageStateHistory.findAll(15 as RelativeTime, 20 as RelativeTime)).toEqual([
      {
        state: PageState.PASSIVE,
        start: 0 as ServerDuration,
      },
      {
        state: PageState.HIDDEN,
        start: 5000000 as ServerDuration,
      },
      {
        state: PageState.FROZEN,
        start: 15000000 as ServerDuration,
      },
    ])
  })
})
