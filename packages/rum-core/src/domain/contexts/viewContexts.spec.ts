import type { RelativeTime } from '@datadog/browser-core'
import { relativeToClocks, CLEAR_OLD_CONTEXTS_INTERVAL } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test/specHelper'
import { setup } from '../../../test/specHelper'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent } from '../rumEventsCollection/view/trackViews'
import type { ViewContexts } from './viewContexts'
import { startViewContexts, VIEW_CONTEXT_TIME_OUT_DELAY } from './viewContexts'

describe('viewContexts', () => {
  const FAKE_ID = 'fake'
  const startClocks = relativeToClocks(10 as RelativeTime)

  function buildViewCreatedEvent(partialViewCreatedEvent: Partial<ViewCreatedEvent> = {}): ViewCreatedEvent {
    return {
      startClocks,
      id: FAKE_ID,
      ...partialViewCreatedEvent,
    }
  }

  let setupBuilder: TestSetupBuilder
  let viewContexts: ViewContexts

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('http://fake-url.com')
      .beforeBuild(({ lifeCycle }) => {
        viewContexts = startViewContexts(lifeCycle)
        return viewContexts
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('findView', () => {
    it('should return undefined when there is no current view and no startTime', () => {
      setupBuilder.build()

      expect(viewContexts.findView()).toBeUndefined()
    })

    it('should return the current view context when there is no start time', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent())

      expect(viewContexts.findView()).toBeDefined()
      expect(viewContexts.findView()!.id).toEqual(FAKE_ID)
    })

    it('should return the view context corresponding to startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(10 as RelativeTime), id: 'view 1' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(20 as RelativeTime), id: 'view 2' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(30 as RelativeTime) })

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(30 as RelativeTime), id: 'view 3' })
      )

      expect(viewContexts.findView(15 as RelativeTime)!.id).toEqual('view 1')
      expect(viewContexts.findView(20 as RelativeTime)!.id).toEqual('view 2')
      expect(viewContexts.findView(40 as RelativeTime)!.id).toEqual('view 3')
    })

    it('should return undefined when no view context corresponding to startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(10 as RelativeTime), id: 'view 1' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(20 as RelativeTime), id: 'view 2' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })

      expect(viewContexts.findView(5 as RelativeTime)).not.toBeDefined()
    })

    it('should set the current view context on VIEW_CREATED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent())
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent({ id: newViewId }))

      expect(viewContexts.findView()!.id).toEqual(newViewId)
    })

    it('should return the view name with the view', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent({ name: 'Fake name' }))
      expect(viewContexts.findView()!.name).toBe('Fake name')
    })
  })

  describe('history contexts', () => {
    it('should be cleared on SESSION_RENEWED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          startClocks: relativeToClocks(10 as RelativeTime),
        })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 2',
          startClocks: relativeToClocks(20 as RelativeTime),
        })
      )

      expect(viewContexts.findView(15 as RelativeTime)).toBeDefined()
      expect(viewContexts.findView(25 as RelativeTime)).toBeDefined()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(viewContexts.findView(15 as RelativeTime)).toBeUndefined()
      expect(viewContexts.findView(25 as RelativeTime)).toBeUndefined()
    })

    it('should be cleared when too old', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      const originalTime = performance.now()
      const originalClocks = relativeToClocks(originalTime as RelativeTime)
      const targetTime = (originalTime + 5) as RelativeTime

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          startClocks: originalClocks,
        })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: relativeToClocks((originalTime + 10) as RelativeTime),
      })
      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks((originalTime + 10) as RelativeTime), id: 'view 2' })
      )

      clock.tick(10)
      expect(viewContexts.findView(targetTime)).toBeDefined()

      clock.tick(VIEW_CONTEXT_TIME_OUT_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)
      expect(viewContexts.findView(targetTime)).toBeUndefined()
    })
  })
})
