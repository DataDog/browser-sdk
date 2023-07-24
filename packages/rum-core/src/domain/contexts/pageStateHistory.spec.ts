import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import type { Clock } from '../../../../core/test'
import { mockClock } from '../../../../core/test'
import type { RumConfiguration } from '../configuration'
import type { PageStateHistory } from './pageStateHistory'
import { startPageStateHistory, PageState } from './pageStateHistory'

describe('pageStateHistory', () => {
  let pageStateHistory: PageStateHistory
  let clock: Clock
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    clock = mockClock()
    pageStateHistory = startPageStateHistory(configuration)
  })

  afterEach(() => {
    pageStateHistory.stop()
    clock.cleanup()
  })

  describe('findAll', () => {
    it('should have the current state when starting', () => {
      expect(pageStateHistory.findAll(0 as RelativeTime, 10 as RelativeTime)).toBeDefined()
    })

    it('should return undefined if the time period is out of history bounds', () => {
      expect(pageStateHistory.findAll(-10 as RelativeTime, 0 as RelativeTime)).not.toBeDefined()
    })

    it('should return the correct page states for the given time period', () => {
      pageStateHistory.addPageState(PageState.ACTIVE)

      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)

      clock.tick(10)
      pageStateHistory.addPageState(PageState.HIDDEN)

      clock.tick(10)
      pageStateHistory.addPageState(PageState.FROZEN)

      clock.tick(10)
      pageStateHistory.addPageState(PageState.TERMINATED)

      /*
      page state time    0     10    20    30    40
      event time                  15<-------->35
      */
      const event = {
        startTime: 15 as RelativeTime,
        duration: 20 as RelativeTime,
      }
      expect(pageStateHistory.findAll(event.startTime, event.duration)).toEqual([
        {
          state: PageState.PASSIVE,
          start: -5000000 as ServerDuration,
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

    it('should limit the number of selectable entries', () => {
      const maxPageStateEntriesSelectable = 1
      pageStateHistory = startPageStateHistory(configuration, maxPageStateEntriesSelectable)

      pageStateHistory.addPageState(PageState.ACTIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)

      expect(pageStateHistory.findAll(0 as RelativeTime, Infinity as RelativeTime)?.length).toEqual(
        maxPageStateEntriesSelectable
      )
    })
  })

  describe('isInActivePageStateAt', () => {
    it('should return true if the page was active at the given time', () => {
      pageStateHistory.addPageState(PageState.ACTIVE)

      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)

      expect(pageStateHistory.isInActivePageStateAt(0 as RelativeTime)).toEqual(true)
    })

    it('should return false if the page was not active at the given time', () => {
      const maxPageStateEntriesSelectable = 1
      pageStateHistory = startPageStateHistory(configuration, maxPageStateEntriesSelectable)

      pageStateHistory.addPageState(PageState.ACTIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)
      expect(pageStateHistory.isInActivePageStateAt(10 as RelativeTime)).toEqual(false)
    })
  })
})
