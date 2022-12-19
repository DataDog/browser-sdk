import type { Duration, RelativeTime } from '@datadog/browser-core'
import { resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import type { TestSetupBuilder } from 'packages/rum-core/test/specHelper'
import { setup } from '../../../test/specHelper'
import type { PageStateContexts } from './pageStateContexts'
import { resetPageStates, startPageStateContexts, addPageState, PageState } from './pageStateContexts'

describe('pageContexts', () => {
  let pageStateContexts: PageStateContexts
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    updateExperimentalFeatures(['resource_page_states'])
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(() => {
        pageStateContexts = startPageStateContexts()
        return pageStateContexts
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
    expect(pageStateContexts.getPageStates(0 as RelativeTime, 10 as RelativeTime)).not.toBeDefined()
  })

  it('should have the current state when starting', () => {
    setupBuilder.build()
    expect(pageStateContexts.getPageStates(0 as RelativeTime, 10 as RelativeTime)).toBeDefined()
  })

  it('should return undefined if timings out of timeline bounds', () => {
    pageStateContexts = startPageStateContexts()
    expect(pageStateContexts.getPageStates(-10 as RelativeTime, 0 as RelativeTime)).not.toBeDefined()
  })

  it('should track the number and duration of all page state', () => {
    const { clock } = setupBuilder.build()
    resetPageStates()

    clock.tick(0)
    addPageState(PageState.ACTIVE)

    clock.tick(10)
    addPageState(PageState.PASSIVE)

    clock.tick(10)
    addPageState(PageState.HIDDEN)

    clock.tick(10)
    addPageState(PageState.FROZEN)

    expect(pageStateContexts.getPageStates(0 as RelativeTime, 50 as RelativeTime)).toEqual({
      active: { count: 1, duration: 10 as Duration },
      passive: { count: 1, duration: 10 as Duration },
      hidden: { count: 1, duration: 10 as Duration },
      frozen: { count: 1, duration: 20 as Duration },
      terminated: { count: 0, duration: 0 as Duration },
    })
  })

  it('should cumulate durations of the same states', () => {
    const { clock } = setupBuilder.build()
    resetPageStates()

    clock.tick(0)
    addPageState(PageState.ACTIVE)

    clock.tick(10)
    addPageState(PageState.PASSIVE)

    clock.tick(10)
    addPageState(PageState.ACTIVE)

    expect(pageStateContexts.getPageStates(0 as RelativeTime, 30 as RelativeTime)).toEqual({
      active: { count: 2, duration: 20 as Duration },
      passive: { count: 1, duration: 10 as Duration },
      hidden: { count: 0, duration: 0 as Duration },
      frozen: { count: 0, duration: 0 as Duration },
      terminated: { count: 0, duration: 0 as Duration },
    })
  })

  it('should limit timeline entry number', () => {
    const limit = 1
    const { clock } = setupBuilder.build()
    resetPageStates()

    clock.tick(10)
    addPageState(PageState.ACTIVE, limit)

    clock.tick(10)
    addPageState(PageState.PASSIVE, limit)

    clock.tick(10)
    addPageState(PageState.ACTIVE, limit)

    expect(pageStateContexts.getPageStates(0 as RelativeTime, 100 as RelativeTime)).toEqual({
      active: { count: 1, duration: jasmine.any(Number) },
      passive: { count: 0, duration: 0 as Duration },
      hidden: { count: 0, duration: 0 as Duration },
      frozen: { count: 0, duration: 0 as Duration },
      terminated: { count: 0, duration: 0 as Duration },
    })
  })
})
