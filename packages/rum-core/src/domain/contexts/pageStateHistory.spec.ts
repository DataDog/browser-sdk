import type { ServerDuration, Duration, RelativeTime } from '@datadog/browser-core'
import { HookNames } from '@datadog/browser-core'
import type { Clock } from '../../../../core/test'
import { mockClock, registerCleanupTask } from '../../../../core/test'
import { createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../test'
import { RumEventType } from '../../rawRumEvent.types'
import * as performanceObservable from '../../browser/performanceObservable'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'
import type { PageStateHistory } from './pageStateHistory'
import { PageState, pageStateDecoratorFactory, startPageStateHistory } from './pageStateHistory'

describe('pageStateHistory', () => {
  let clock: Clock
  let hooks: Hooks
  const configuration = mockRumConfiguration()

  beforeEach(() => {
    clock = mockClock()
    hooks = createHooks()
  })

  describe('wasInPageStateDuringPeriod', () => {
    let pageStateHistory: PageStateHistory

    beforeEach(() => {
      mockPerformanceObserver()
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
        mockPerformanceObserver()
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
        } as AssembleHookParams)

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
        } as AssembleHookParams)
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
        } as AssembleHookParams)

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
        } as AssembleHookParams)

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
        mockPerformanceObserver()
        pageStateHistory = startPageStateHistory(hooks, configuration)
        registerCleanupTask(pageStateHistory.stop)
      })

      it('should add in_foreground: true when the page is active', () => {
        pageStateHistory.addPageState(PageState.ACTIVE)

        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: clock.relative(0),
          duration: 0 as Duration,
        } as AssembleHookParams)

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
        } as AssembleHookParams)

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
      const { notifyPerformanceEntries } = mockPerformanceObserver({
        supportedEntryTypes: [performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE],
      })

      notifyPerformanceEntries([
        createPerformanceEntry(performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE, {
          name: 'visible',
          startTime: 5 as RelativeTime,
        }),
        createPerformanceEntry(performanceObservable.RumPerformanceEntryType.VISIBILITY_STATE, {
          name: 'hidden',
          startTime: 15 as RelativeTime,
        }),
      ])

      pageStateHistory = startPageStateHistory(hooks, configuration)
      registerCleanupTask(pageStateHistory.stop)

      expect(pageStateHistory.wasInPageStateDuringPeriod(PageState.ACTIVE, 5 as RelativeTime, 5 as Duration)).toBeTrue()
      expect(
        pageStateHistory.wasInPageStateDuringPeriod(PageState.HIDDEN, 15 as RelativeTime, 5 as Duration)
      ).toBeTrue()
    })

    it('should not backfill if visibility-state is not supported', () => {
      mockPerformanceObserver({
        supportedEntryTypes: [],
      })

      pageStateHistory = startPageStateHistory(hooks, configuration)
      registerCleanupTask(pageStateHistory.stop)

      expect(
        pageStateHistory.wasInPageStateDuringPeriod(PageState.ACTIVE, 5 as RelativeTime, 5 as Duration)
      ).toBeFalse()
    })
  })
})

describe('pageStateDecoratorFactory', () => {
  it('should contribute pageStates for view events', async () => {
    const mockEntries = [{ state: PageState.ACTIVE, startTime: 0 as RelativeTime }]
    const factory = pageStateDecoratorFactory({
      findAll: () => mockEntries,
      wasInPageStateDuringPeriod: () => true,
    })
    const obs: Observation = { type: 'view', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).pageStates).toBeDefined()
    }
  })

  it('should contribute inForeground for action events', async () => {
    const factory = pageStateDecoratorFactory({
      findAll: () => [],
      wasInPageStateDuringPeriod: () => true,
    })
    const obs: Observation = { type: 'action', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).inForeground).toBe(true)
    }
  })

  it('should contribute inForeground for error events', async () => {
    const factory = pageStateDecoratorFactory({
      findAll: () => [],
      wasInPageStateDuringPeriod: () => false,
    })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).inForeground).toBe(false)
    }
  })

  it('should skip for other event types', async () => {
    const factory = pageStateDecoratorFactory({
      findAll: () => [],
      wasInPageStateDuringPeriod: () => false,
    })
    const obs: Observation = { type: 'resource', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare canDiscard: false', () => {
    const factory = pageStateDecoratorFactory({
      findAll: () => [],
      wasInPageStateDuringPeriod: () => false,
    })
    expect(factory.capabilities.canDiscard).toBe(false)
  })
})
