import { createRawRumEvent } from '../../../../test/fixtures'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import {
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { RawRumEvent, RumEventCategory } from '../../../types'
import { RumEventType } from '../../../typesV2'
import { LifeCycleEventType } from '../../lifeCycle'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
} from '../../trackPageActivities'
import { THROTTLE_VIEW_UPDATE_PERIOD, trackViews, View, ViewCreatedEvent, ViewLoadingType } from './trackViews'

const AFTER_PAGE_ACTIVITY_MAX_DURATION = PAGE_ACTIVITY_MAX_DURATION * 1.1
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const FAKE_PAINT_ENTRY: RumPerformancePaintTiming = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123,
}
const FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY: RumLargestContentfulPaintTiming = {
  entryType: 'largest-contentful-paint',
  startTime: 789,
}
const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  domComplete: 456,
  domContentLoadedEventEnd: 345,
  domInteractive: 234,
  entryType: 'navigation',
  loadEventEnd: 567,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  domComplete: 2,
  domContentLoadedEventEnd: 1,
  domInteractive: 1,
  entryType: 'navigation',
  loadEventEnd: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  domComplete: 2,
  domContentLoadedEventEnd: 1,
  domInteractive: 1,
  entryType: 'navigation',
  loadEventEnd: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2,
}

function mockGetElementById() {
  return spyOn(document, 'getElementById').and.callFake((elementId: string) => {
    return (elementId === ('testHashValue' as unknown)) as any
  })
}

function spyOnViews() {
  const handler = jasmine.createSpy()

  function getViewEvent(index: number) {
    return handler.calls.argsFor(index)[0] as View
  }

  function getHandledCount() {
    return handler.calls.count()
  }

  return { handler, getViewEvent, getHandledCount }
}

describe('rum track url change', () => {
  let setupBuilder: TestSetupBuilder
  let initialViewId: string
  let createSpy: jasmine.Spy<(event: ViewCreatedEvent) => void>

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ id }) => {
          initialViewId = id
          subscription.unsubscribe()
        })
        return trackViews(location, lifeCycle)
      })
    createSpy = jasmine.createSpy('create')
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on path change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should create a new view on hash change from history', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should not create a new view on hash change from history when the hash has kept the same value', () => {
    history.pushState({}, '', '/foo#bar')

    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('should create a new view on hash change', (done) => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).toHaveBeenCalled()
      const viewContext = createSpy.calls.argsFor(0)[0]
      expect(viewContext.id).not.toEqual(initialViewId)
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#bar'
  })

  it('should not create a new view when the hash has kept the same value', (done) => {
    history.pushState({}, '', '/foo#bar')

    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#bar'
  })

  it('should not create a new view when it is an Anchor navigation', (done) => {
    const { lifeCycle } = setupBuilder.build()
    mockGetElementById()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#testHashValue'
  })

  it('should acknowledge the view location hash change after an Anchor navigation', (done) => {
    const { lifeCycle } = setupBuilder.build()
    const spyObj = mockGetElementById()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)

      // clear mockGetElementById that fake Anchor nav
      spyObj.and.callThrough()

      // This is not an Anchor nav anymore but the hash and pathname have not been updated
      history.pushState({}, '', '/foo#testHashValue')
      expect(createSpy).not.toHaveBeenCalled()
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#testHashValue'
  })

  it('should not create new view on search change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo?bar=qux')

    expect(createSpy).not.toHaveBeenCalled()
  })
})

describe('rum view referrer', () => {
  let setupBuilder: TestSetupBuilder
  let initialViewCreatedEvent: ViewCreatedEvent
  let createSpy: jasmine.Spy<(event: ViewCreatedEvent) => void>

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (event) => {
          initialViewCreatedEvent = event
          subscription.unsubscribe()
        })
        return trackViews(location, lifeCycle)
      })
    createSpy = jasmine.createSpy('create')
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should set the document referrer as referrer for the initial view', () => {
    setupBuilder.build()
    expect(initialViewCreatedEvent.referrer).toEqual(document.referrer)
  })

  it('should set the previous view URL as referrer when a route change occurs', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.referrer).toEqual(jasmine.stringMatching(/\/foo$/))
  })

  it('should set the previous view URL as referrer when a the session is renewed', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.referrer).toEqual(jasmine.stringMatching(/\/foo$/))
  })

  it('should use the most up-to-date URL of the previous view as a referrer', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo?a=b')
    history.pushState({}, '', '/bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.referrer).toEqual(jasmine.stringMatching(/\/foo\?a=b$/))
  })
})

describe('rum track renew session', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let initialViewId: string
  let getHandledCount: () => number
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent, getHandledCount } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ lifeCycle, location }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ id }) => {
          initialViewId = id
          subscription.unsubscribe()
        })
        return trackViews(location, lifeCycle)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on renew session', () => {
    const { lifeCycle } = setupBuilder.build()
    const createSpy = jasmine.createSpy<(event: ViewCreatedEvent) => void>('create')
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should send a final view event when the session is renewed', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(0).id).not.toBe(getViewEvent(1).id)
  })
})

describe('rum track loading type', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeClock()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should collect initial view type as "initial_load"', () => {
    setupBuilder.build()
    expect(getViewEvent(0).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)
  })

  it('should collect view type as "route_change" after a route change', () => {
    setupBuilder.build()
    history.pushState({}, '', '/bar')
    expect(getViewEvent(1).location.pathname).toEqual('/foo')
    expect(getViewEvent(1).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)

    expect(getViewEvent(2).location.pathname).toEqual('/bar')
    expect(getViewEvent(2).loadingType).toEqual(ViewLoadingType.ROUTE_CHANGE)
  })
})

describe('rum track loading time', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View
  let getHandledCount: () => number

  beforeEach(() => {
    ;({ handler, getHandledCount, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeClock()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should have an undefined loading time if there is no activity on a route change', () => {
    const { clock } = setupBuilder.build()

    history.pushState({}, '', '/bar')
    clock.tick(AFTER_PAGE_ACTIVITY_MAX_DURATION)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(2).loadingTime).toBeUndefined()
  })

  it('should have a loading time equal to the activity time if there is a unique activity on a route change', () => {
    const { lifeCycle, clock } = setupBuilder.build()

    history.pushState({}, '', '/bar')
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewEvent(3).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })

  it('should use loadEventEnd for initial view when having no activity', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY.loadEventEnd)
  })

  it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING
    )

    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING.loadEventEnd)
  })

  it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING
    )
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })
})

describe('rum view measures', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getHandledCount: () => number
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent, getHandledCount } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('timings', () => {
    it('should update timings when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).timings).toEqual({})

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)

      expect(getHandledCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).timings).toEqual({
        domComplete: 456,
        domContentLoaded: 345,
        domInteractive: 234,
        loadEventEnd: 567,
      })
    })

    it('should update timings when ending a view', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).timings).toEqual({})

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
      expect(getHandledCount()).toEqual(1)

      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).timings).toEqual({
        domComplete: 456,
        domContentLoaded: 345,
        domInteractive: 234,
        firstContentfulPaint: 123,
        largestContentfulPaint: 789,
        loadEventEnd: 567,
      })
      expect(getViewEvent(2).timings).toEqual({})
    })

    describe('load event happening after initial view end', () => {
      let initialView: { init: View; end: View; last: View }
      let secondView: { init: View; last: View }
      const VIEW_DURATION = 100

      beforeEach(() => {
        const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
        expect(getHandledCount()).toEqual(1)

        clock.tick(VIEW_DURATION)

        history.pushState({}, '', '/bar')

        clock.tick(VIEW_DURATION)

        expect(getHandledCount()).toEqual(3)

        lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)
        lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)
        lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)

        clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

        expect(getHandledCount()).toEqual(4)

        initialView = {
          end: getViewEvent(1),
          init: getViewEvent(0),
          last: getViewEvent(3),
        }
        secondView = {
          init: getViewEvent(2),
          last: getViewEvent(2),
        }
      })

      it('should not set timings to the second view', () => {
        expect(secondView.last.timings).toEqual({})
      })

      it('should set timings only on the initial view', () => {
        expect(initialView.last.timings).toEqual({
          domComplete: 456,
          domContentLoaded: 345,
          domInteractive: 234,
          firstContentfulPaint: 123,
          largestContentfulPaint: 789,
          loadEventEnd: 567,
        })
      })

      it('should not update the initial view duration when updating it with new timings', () => {
        expect(initialView.end.duration).toBe(VIEW_DURATION)
        expect(initialView.last.duration).toBe(VIEW_DURATION)
      })

      it('should update the initial view loadingTime following the loadEventEnd value', () => {
        expect(initialView.last.loadingTime).toBe(FAKE_NAVIGATION_ENTRY.loadEventEnd)
      })
    })
  })

  describe('event counts', () => {
    function createFakeCollectedRawRumEvent(category: RumEventCategory) {
      return {
        rawRumEvent: ({ evt: { category } } as unknown) as RawRumEvent,
        startTime: 0,
      }
    }

    it('should track error count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.errorCount).toEqual(0)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.ERROR)
      )
      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.ERROR)
      )
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.errorCount).toEqual(2)
      expect(getViewEvent(2).eventCounts.errorCount).toEqual(0)
    })

    it('should track long task count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.longTaskCount).toEqual(0)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.LONG_TASK)
      )
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.longTaskCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.longTaskCount).toEqual(0)
    })

    it('should track resource count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.RESOURCE)
      )
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)
    })

    it('should track action count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.userActionCount).toEqual(0)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.USER_ACTION)
      )
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.userActionCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.userActionCount).toEqual(0)
    })

    it('should reset event count when the view changes', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.RESOURCE)
      )
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.RESOURCE)
      )
      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.RESOURCE)
      )
      history.pushState({}, '', '/baz')

      expect(getHandledCount()).toEqual(5)
      expect(getViewEvent(3).eventCounts.resourceCount).toEqual(2)
      expect(getViewEvent(4).eventCounts.resourceCount).toEqual(0)
    })

    it('should update eventCounts when a resource event is collected (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
        userActionCount: 0,
      })

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.RESOURCE)
      )

      expect(getHandledCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 1,
        userActionCount: 0,
      })
    })

    it('should not update eventCounts after ending a view', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)

      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createFakeCollectedRawRumEvent(RumEventCategory.RESOURCE)
      )

      expect(getHandledCount()).toEqual(1)

      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).id).toEqual(getViewEvent(0).id)
      expect(getViewEvent(2).id).not.toEqual(getViewEvent(0).id)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(3)
    })
  })

  describe('event counts V2', () => {
    it('should track error count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.errorCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ERROR),
        startTime: 0,
      })
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ERROR),
        startTime: 0,
      })
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.errorCount).toEqual(2)
      expect(getViewEvent(2).eventCounts.errorCount).toEqual(0)
    })

    it('should track long task count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.longTaskCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK),
        startTime: 0,
      })
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.longTaskCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.longTaskCount).toEqual(0)
    })

    it('should track resource count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        startTime: 0,
      })
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)
    })

    it('should track action count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.userActionCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION),
        startTime: 0,
      })
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.userActionCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.userActionCount).toEqual(0)
    })

    it('should reset event count when the view changes', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        startTime: 0,
      })
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        startTime: 0,
      })
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        startTime: 0,
      })
      history.pushState({}, '', '/baz')

      expect(getHandledCount()).toEqual(5)
      expect(getViewEvent(3).eventCounts.resourceCount).toEqual(2)
      expect(getViewEvent(4).eventCounts.resourceCount).toEqual(0)
    })

    it('should update eventCounts when a resource event is collected (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
        userActionCount: 0,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        startTime: 0,
      })

      expect(getHandledCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 1,
        userActionCount: 0,
      })
    })

    it('should not update eventCounts after ending a view', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.RESOURCE),
        startTime: 0,
      })

      expect(getHandledCount()).toEqual(1)

      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).id).toEqual(getViewEvent(0).id)
      expect(getViewEvent(2).id).not.toEqual(getViewEvent(0).id)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(3)
    })
  })

  describe('cumulativeLayoutShift', () => {
    let isLayoutShiftSupported: boolean
    beforeEach(() => {
      if (!('PerformanceObserver' in window) || !('supportedEntryTypes' in PerformanceObserver)) {
        pending('No PerformanceObserver support')
      }
      isLayoutShiftSupported = true
      spyOnProperty(PerformanceObserver, 'supportedEntryTypes', 'get').and.callFake(() => {
        return isLayoutShiftSupported ? ['layout-shift'] : []
      })
    })

    it('should be initialized to 0', () => {
      setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).cumulativeLayoutShift).toBe(0)
    })

    it('should be initialized to undefined if layout-shift is not supported', () => {
      isLayoutShiftSupported = false
      setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).cumulativeLayoutShift).toBe(undefined)
    })

    it('should accmulate layout shift values', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.1,
      })

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.2,
      })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).cumulativeLayoutShift).toBe(0.1 + 0.2)
    })

    it('should ignore entries with recent input', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: true,
        value: 0.1,
      })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).cumulativeLayoutShift).toBe(0)
    })
  })
})
