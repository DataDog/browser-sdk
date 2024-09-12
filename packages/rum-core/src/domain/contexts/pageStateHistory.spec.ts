import type { ServerDuration, Duration } from '@datadog/browser-core'
import type { Clock } from '../../../../core/test'
import { mockClock, registerCleanupTask } from '../../../../core/test'
import { mockRumConfiguration } from '../../../test'
import type { PageStateHistory } from './pageStateHistory'
import { PageState, startPageStateHistory } from './pageStateHistory'

describe('pageStateHistory', () => {
  let pageStateHistory: PageStateHistory
  let clock: Clock
  const configuration = mockRumConfiguration()

  beforeEach(() => {
    clock = mockClock()
    pageStateHistory = startPageStateHistory(configuration)
    registerCleanupTask(pageStateHistory.stop)
  })

  afterEach(() => {
    clock.cleanup()
  })

  describe('findAll', () => {
    it('should have the current state when starting', () => {
      expect(pageStateHistory.findAll(clock.relative(0), 10 as Duration)).toBeDefined()
    })

    it('should return undefined if the time period is out of history bounds', () => {
      expect(pageStateHistory.findAll(clock.relative(-10), 0 as Duration)).not.toBeDefined()
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
        startTime: clock.relative(15),
        duration: 20 as Duration,
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
      registerCleanupTask(pageStateHistory.stop)

      pageStateHistory.addPageState(PageState.ACTIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)

      expect(pageStateHistory.findAll(clock.relative(0), Infinity as Duration)?.length).toEqual(
        maxPageStateEntriesSelectable
      )
    })
  })

  describe('wasInPageStateAt', () => {
    it('should return true if the page was in the given state at the given time', () => {
      pageStateHistory.addPageState(PageState.ACTIVE)

      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)

      expect(pageStateHistory.wasInPageStateAt(PageState.ACTIVE, clock.relative(0))).toEqual(true)
    })

    it('should return false if the page was not in the given state at the given time', () => {
      const maxPageStateEntriesSelectable = 1
      pageStateHistory = startPageStateHistory(configuration, maxPageStateEntriesSelectable)
      registerCleanupTask(pageStateHistory.stop)

      pageStateHistory.addPageState(PageState.ACTIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)
      expect(pageStateHistory.wasInPageStateAt(PageState.ACTIVE, clock.relative(11))).toEqual(false)
    })
  })

  describe('wasInPageSateDuringPeriod', () => {
    it('should return true if the page was in the given state during the given period', () => {
      pageStateHistory.addPageState(PageState.ACTIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.HIDDEN)
      clock.tick(10)

      expect(pageStateHistory.wasInPageStateDuringPeriod(PageState.PASSIVE, clock.relative(0), 30 as Duration)).toEqual(
        true
      )
    })

    it('should return false if the page was not in the given state during the given period', () => {
      pageStateHistory.addPageState(PageState.ACTIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.PASSIVE)
      clock.tick(10)
      pageStateHistory.addPageState(PageState.HIDDEN)
      clock.tick(10)

      expect(pageStateHistory.wasInPageStateDuringPeriod(PageState.FROZEN, clock.relative(0), 30 as Duration)).toEqual(
        false
      )
    })

    it('should return false if there was no page state during the given period', () => {
      // pageStateHistory is initialized with the current page state
      // look for a period before the initialization to make sure there is no page state
      expect(
        pageStateHistory.wasInPageStateDuringPeriod(PageState.ACTIVE, clock.relative(-40), 30 as Duration)
      ).toEqual(false)
    })
  })
})
