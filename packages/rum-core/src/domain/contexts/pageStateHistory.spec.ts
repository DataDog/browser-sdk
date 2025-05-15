import type { ServerDuration, Duration } from '@flashcatcloud/browser-core'
import type { Clock } from '../../../../core/test'
import { mockClock, registerCleanupTask } from '../../../../core/test'
import { mockRumConfiguration } from '../../../test'
import { createHooks, HookNames } from '../../hooks'
import type { Hooks } from '../../hooks'
import { RumEventType } from '../../rawRumEvent.types'
import type { PageStateHistory } from './pageStateHistory'
import { PageState, startPageStateHistory } from './pageStateHistory'

describe('pageStateHistory', () => {
  let pageStateHistory: PageStateHistory
  let clock: Clock
  let hooks: Hooks
  const configuration = mockRumConfiguration()

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()
    pageStateHistory = startPageStateHistory(hooks, configuration)
    registerCleanupTask(pageStateHistory.stop)
  })

  afterEach(() => {
    clock.cleanup()
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

  describe('assemble hook', () => {
    describe('for view events', () => {
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
        const event = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(15),
          duration: 20 as Duration,
        })

        expect(event).toEqual({
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
        const event = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(0),
          duration: 10 as Duration,
        })
        expect(event).toEqual({
          type: 'view',
          _dd: { page_states: jasmine.any(Array) },
        })
      })

      it('should not add the page state if the time period is out of history bounds', () => {
        const event = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(-10),
          duration: 0 as Duration,
        })

        expect(event).toEqual({
          type: 'view',
          _dd: { page_states: undefined },
        })
      })

      it('should limit the number of page states added', () => {
        const maxPageStateEntriesSelectable = 1
        pageStateHistory = startPageStateHistory(hooks, configuration, maxPageStateEntriesSelectable)
        registerCleanupTask(pageStateHistory.stop)

        pageStateHistory.addPageState(PageState.ACTIVE)
        clock.tick(10)
        pageStateHistory.addPageState(PageState.PASSIVE)

        const event = hooks.triggerHook(HookNames.Assemble, {
          eventType: 'view',
          startTime: clock.relative(0),
          duration: Infinity as Duration,
        })

        expect(event).toEqual({
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
      it('should add in_foreground: true when the page is active', () => {
        pageStateHistory.addPageState(PageState.ACTIVE)

        const event = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: clock.relative(0),
          duration: 0 as Duration,
        })

        expect(event).toEqual({
          type: eventType,
          view: { in_foreground: true },
        })
      })

      it('should add in_foreground: false when the page is not active', () => {
        pageStateHistory.addPageState(PageState.HIDDEN)

        const event = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: clock.relative(0),
          duration: 0 as Duration,
        })

        expect(event).toEqual({
          type: eventType,
          view: { in_foreground: false },
        })
      })
    })
  })
})
