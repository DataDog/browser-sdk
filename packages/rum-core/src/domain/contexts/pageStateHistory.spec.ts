import type { ServerDuration, Duration, RelativeTime } from '@datadog/browser-core'
import type { Clock } from '../../../../core/test'
import { mockClock, registerCleanupTask } from '../../../../core/test'
import { mockRumConfiguration, mockPerformanceObserver } from '../../../test'
import { createHooks, HookNames } from '../../hooks'
import type { Hooks } from '../../hooks'
import { RumEventType } from '../../rawRumEvent.types'
import * as performanceObservable from '../../browser/performanceObservable'
import type { PageStateHistory } from './pageStateHistory'
import { PageState, startPageStateHistory } from './pageStateHistory'

describe('pageStateHistory', () => {
  let clock: Clock
  let hooks: Hooks
  const configuration = mockRumConfiguration()
  let getEntriesByTypeSpy: jasmine.Spy<Performance['getEntriesByType']>

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()
    getEntriesByTypeSpy = spyOn(performance, 'getEntriesByType').and.returnValue([])
  })

  afterEach(() => {
    clock.cleanup()
  })

  describe('wasInPageStateDuringPeriod', () => {
    let pageStateHistory: PageStateHistory

    beforeEach(() => {
      pageStateHistory = startPageStateHistory(hooks, configuration)
      registerCleanupTask(pageStateHistory.stop)
    })

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

  describe('assemble hook', () => {
    describe('for view events', () => {
      let pageStateHistory: PageStateHistory

      beforeEach(() => {
        pageStateHistory = startPageStateHistory(hooks, configuration)
        registerCleanupTask(pageStateHistory.stop)
      })

      it('should add the correct page states for the given time period', () => {
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
        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(15),
          duration: 20 as Duration,
        })

        expect(defaultRumEventAttributes).toEqual({
          type: 'view',
          _dd: {
            page_states: [
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
            ],
          },
        })
      })

      it('should add the current state when starting', () => {
        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(0),
          duration: 10 as Duration,
        })
        expect(defaultRumEventAttributes).toEqual({
          type: 'view',
          _dd: { page_states: jasmine.any(Array) },
        })
      })

      it('should not add the page state if the time period is out of history bounds', () => {
        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(-10),
          duration: 0 as Duration,
        })

        expect(defaultRumEventAttributes).toEqual({
          type: 'view',
          _dd: { page_states: undefined },
        })
      })

      it('should limit the number of page states added', () => {
        pageStateHistory.stop()
        const maxPageStateEntriesSelectable = 1
        pageStateHistory = startPageStateHistory(hooks, configuration, maxPageStateEntriesSelectable)
        registerCleanupTask(pageStateHistory.stop)

        pageStateHistory.addPageState(PageState.ACTIVE)
        clock.tick(10)
        pageStateHistory.addPageState(PageState.PASSIVE)

        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(0),
          duration: Infinity as Duration,
        })

        expect(defaultRumEventAttributes).toEqual({
          type: 'view',
          _dd: {
            page_states: [
              {
                state: PageState.PASSIVE,
                start: 0 as ServerDuration,
              },
            ],
          },
        })
      })
    })
  })
  ;[RumEventType.ACTION, RumEventType.ERROR].forEach((eventType) => {
    describe(`for ${eventType} events`, () => {
      let pageStateHistory: PageStateHistory

      beforeEach(() => {
        pageStateHistory = startPageStateHistory(hooks, configuration)
        registerCleanupTask(pageStateHistory.stop)
      })

      it('should add in_foreground: true when the page is active', () => {
        pageStateHistory.addPageState(PageState.ACTIVE)

        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: clock.relative(0),
          duration: 0 as Duration,
        })

        expect(defaultRumEventAttributes).toEqual({
          type: eventType,
          view: { in_foreground: true },
        })
      })

      it('should add in_foreground: false when the page is not active', () => {
        pageStateHistory.addPageState(PageState.HIDDEN)

        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: clock.relative(0),
          duration: 0 as Duration,
        })

        expect(defaultRumEventAttributes).toEqual({
          type: eventType,
          view: { in_foreground: false },
        })
      })
    })
  })

  describe('initialization with visibility-state backfill', () => {
    let pageStateHistory: PageStateHistory

    afterEach(() => {
      if (pageStateHistory) {
        pageStateHistory.stop()
      }
    })

    it('should backfill history if visibility-state is supported and entries exist', () => {
      mockPerformanceObserver({
        supportedEntryTypes: [
          ...Object.values(performanceObservable.RumPerformanceEntryType).filter(
            (type) => type !== performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE
          ),
          performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE,
        ],
      })

      const mockEntries = [
        { entryType: 'visibility-state', name: 'visible', startTime: 5 },
        { entryType: 'visibility-state', name: 'hidden', startTime: 15 },
      ] as PerformanceEntry[]
      getEntriesByTypeSpy
        .withArgs(performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE)
        .and.returnValue(mockEntries)

      pageStateHistory = startPageStateHistory(hooks, configuration)
      registerCleanupTask(pageStateHistory.stop)

      expect(pageStateHistory.wasInPageStateDuringPeriod(PageState.ACTIVE, 5 as RelativeTime, 5 as Duration)).toBeTrue()
      expect(
        pageStateHistory.wasInPageStateDuringPeriod(PageState.HIDDEN, 15 as RelativeTime, 5 as Duration)
      ).toBeTrue()
    })

    it('should not backfill if visibility-state is not supported', () => {
      mockPerformanceObserver({
        supportedEntryTypes: Object.values(performanceObservable.RumPerformanceEntryType).filter(
          (type) => type !== performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE
        ),
      })

      getEntriesByTypeSpy.calls.reset()

      pageStateHistory = startPageStateHistory(hooks, configuration)
      registerCleanupTask(pageStateHistory.stop)

      expect(getEntriesByTypeSpy).not.toHaveBeenCalledWith(
        performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE
      )
    })
  })
})
