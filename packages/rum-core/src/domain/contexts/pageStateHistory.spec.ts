import type { RelativeTime } from '@datadog/browser-core'
import { resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import type { TestSetupBuilder } from 'packages/rum-core/test/specHelper'
import { setup } from '../../../test/specHelper'
import type { PageStateHistory } from './pageStateHistory'
import { resetPageStates, startPageStateHistory, addPageState, PageState } from './pageStateHistory'

describe('pageStateHistory', () => {
  let pageStateHistory: PageStateHistory
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    updateExperimentalFeatures(['resource_page_states'])
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(() => {
        pageStateHistory = startPageStateHistory()
        return pageStateHistory
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
    resetPageStates()
    resetExperimentalFeatures()
  })

  it('should not track page states when ff resource_page_states is disabled', () => {
    resetExperimentalFeatures()
    setupBuilder.build()
    expect(pageStateHistory.findAll(0 as RelativeTime, 10 as RelativeTime)).not.toBeDefined()
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
    resetPageStates()

    addPageState(PageState.ACTIVE)

    clock.tick(10)
    addPageState(PageState.PASSIVE)

    clock.tick(10)
    addPageState(PageState.HIDDEN)

    clock.tick(10)
    addPageState(PageState.FROZEN)

    clock.tick(10)
    addPageState(PageState.TERMINATED)

    expect(pageStateHistory.findAll(15 as RelativeTime, 20 as RelativeTime)).toEqual([
      {
        state: PageState.PASSIVE,
        startTime: 10 as RelativeTime,
      },
      {
        state: PageState.HIDDEN,
        startTime: 20 as RelativeTime,
      },
      {
        state: PageState.FROZEN,
        startTime: 30 as RelativeTime,
      },
    ])
  })

  it('should limit the history entry number', () => {
    const limit = 1
    const { clock } = setupBuilder.build()
    resetPageStates()

    clock.tick(10)
    addPageState(PageState.ACTIVE, limit)

    clock.tick(10)
    addPageState(PageState.PASSIVE, limit)

    clock.tick(10)
    addPageState(PageState.HIDDEN, limit)

    expect(pageStateHistory.findAll(0 as RelativeTime, 40 as RelativeTime)).toEqual([
      {
        state: PageState.HIDDEN,
        startTime: 30 as RelativeTime,
      },
    ])
  })
})
