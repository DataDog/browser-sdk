import { catchUserErrors, Context, Duration, RelativeTime } from '../../../../../core/src'
import { RumEvent } from '../../../../../rum/src'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { NewLocationListener } from '../../../boot/rum'
import {
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { RumEventType, ViewLoadingType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
} from '../../trackPageActivities'
import { THROTTLE_VIEW_UPDATE_PERIOD, trackViews, View, ViewCreatedEvent } from './trackViews'

const AFTER_PAGE_ACTIVITY_MAX_DURATION = PAGE_ACTIVITY_MAX_DURATION * 1.1
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration
const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const FAKE_PAINT_ENTRY: RumPerformancePaintTiming = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123 as RelativeTime,
}
const FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY: RumLargestContentfulPaintTiming = {
  entryType: 'largest-contentful-paint',
  startTime: 789 as RelativeTime,
}
const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  domComplete: 456 as RelativeTime,
  domContentLoadedEventEnd: 345 as RelativeTime,
  domInteractive: 234 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: 567 as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  domComplete: 2 as RelativeTime,
  domContentLoadedEventEnd: 1 as RelativeTime,
  domInteractive: 1 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  domComplete: 2 as RelativeTime,
  domContentLoadedEventEnd: 1 as RelativeTime,
  domInteractive: 1 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2) as RelativeTime,
}

function mockGetElementById() {
  const fakeGetElementById = (elementId: string) => ((elementId === 'testHashValue') as any) as HTMLElement
  return spyOn(document, 'getElementById').and.callFake(fakeGetElementById)
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

describe('rum use onNewLocation callback to rename/ignore views', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View
  let onNewLocation: NewLocationListener

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, catchUserErrors(onNewLocation, 'onNewLocation threw an error:'))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should set the view name to the returned viewName', () => {
    onNewLocation = (location) => {
      switch (location.pathname) {
        case '/foo':
          return { viewName: 'Foo' }
        case '/bar':
          return { viewName: 'Bar' }
      }
    }
    setupBuilder.build()
    history.pushState({}, '', '/bar')
    history.pushState({}, '', '/baz')

    expect(getViewEvent(0).name).toBe('Foo')
    expect(getViewEvent(2).name).toBe('Bar')
    expect(getViewEvent(4).name).toBeUndefined()
  })

  it('should allow customer to consider other location changes as new views', () => {
    onNewLocation = (location) => ({ viewName: `Foo ${location.search}`, shouldCreateView: true })
    setupBuilder.build()
    history.pushState({}, '', '/foo?view=bar')
    history.pushState({}, '', '/foo?view=baz')

    expect(getViewEvent(0).name).toBe('Foo ')
    expect(getViewEvent(2).name).toBe('Foo ?view=bar')
    expect(getViewEvent(4).name).toBe('Foo ?view=baz')
  })

  it('pass current and old locations to onNewLocation', () => {
    onNewLocation = (location, oldLocation) => ({
      viewName: `old: ${oldLocation?.pathname || 'undefined'}, new: ${location.pathname}`,
    })
    setupBuilder.build()
    history.pushState({}, '', '/bar')

    expect(getViewEvent(0).name).toBe('old: undefined, new: /foo')
    expect(getViewEvent(2).name).toBe('old: /foo, new: /bar')
  })

  it('should use our own new view detection rules when shouldCreateView is undefined', () => {
    onNewLocation = (location) => {
      switch (location.pathname) {
        case '/foo':
          return { viewName: 'Foo' }
        case '/bar':
          return { viewName: 'Bar' }
      }
    }
    setupBuilder.build()
    history.pushState({}, '', '/foo')
    history.pushState({}, '', '/bar')
    history.pushState({}, '', '/bar')
    history.pushState({}, '', '/foo')

    expect(getViewEvent(0).name).toBe('Foo')
    expect(getViewEvent(2).id).toBe(getViewEvent(0).id)
    expect(getViewEvent(3).name).toBe('Bar')
    expect(getViewEvent(5).id).toBe(getViewEvent(3).id)
    expect(getViewEvent(6).name).toBe('Foo')
  })

  it('should ignore the view when shouldCreateView is false', () => {
    onNewLocation = (location) => {
      switch (location.pathname) {
        case '/foo':
          return { viewName: 'Foo', shouldCreateView: true }
        case '/bar':
          return { shouldCreateView: false }
        case '/baz':
          return { viewName: 'Baz', shouldCreateView: true }
      }
    }
    setupBuilder.build()
    history.pushState({}, '', '/bar')
    history.pushState({}, '', '/baz')

    const initialViewId = getViewEvent(0).id
    expect(getViewEvent(0).name).toBe('Foo')
    expect(getViewEvent(2).name).toBe('Foo')
    expect(getViewEvent(2).id).toBe(initialViewId)
    expect(getViewEvent(3).name).toBe('Baz')
    expect(getViewEvent(3).id).not.toBe(initialViewId)
  })

  it('should create the initial view even when shouldCreateView is false', () => {
    onNewLocation = (location) => {
      if (location.pathname === '/foo') {
        return { shouldCreateView: false }
      }
      if (location.pathname === '/bar') {
        return { shouldCreateView: true }
      }
    }
    setupBuilder.build()
    history.pushState({}, '', '/bar')
    history.pushState({}, '', '/foo')

    expect(getViewEvent(0).location.pathname).toBe('/foo')
    expect(getViewEvent(2).location.pathname).toBe('/bar')
    expect(getViewEvent(4)).toBeUndefined()
  })

  it('should catch thrown errors', () => {
    const fooError = 'Error on /foo path'
    const barError = 'Error on /bar path'
    onNewLocation = (location) => {
      if (location.pathname === '/foo') {
        throw fooError
      }
      if (location.pathname === '/bar') {
        throw barError
      }
      return undefined
    }
    const consoleErrorSpy = spyOn(console, 'error')
    setupBuilder.build()
    expect(consoleErrorSpy).toHaveBeenCalledWith('onNewLocation threw an error:', fooError)
    history.pushState({}, '', '/bar')
    expect(consoleErrorSpy).toHaveBeenCalledWith('onNewLocation threw an error:', barError)
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

describe('rum track view is active', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

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

  it('should set initial view as active', () => {
    setupBuilder.build()
    expect(getViewEvent(0).isActive).toBe(true)
  })

  it('should set old view as inactive and new one as active after a route change', () => {
    setupBuilder.build()
    history.pushState({}, '', '/bar')
    expect(getViewEvent(1).isActive).toBe(false)
    expect(getViewEvent(2).isActive).toBe(true)
  })

  it('should keep view as active after a search change', () => {
    setupBuilder.build()
    history.pushState({}, '', '/foo?bar=qux')
    expect(getViewEvent(1).isActive).toBe(true)
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
        domComplete: 456 as Duration,
        domContentLoaded: 345 as Duration,
        domInteractive: 234 as Duration,
        loadEvent: 567 as Duration,
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
        domComplete: 456 as Duration,
        domContentLoaded: 345 as Duration,
        domInteractive: 234 as Duration,
        firstContentfulPaint: 123 as Duration,
        largestContentfulPaint: 789 as Duration,
        loadEvent: 567 as Duration,
      })
      expect(getViewEvent(2).timings).toEqual({})
    })

    describe('load event happening after initial view end', () => {
      let initialView: { init: View; end: View; last: View }
      let secondView: { init: View; last: View }
      const VIEW_DURATION = 100 as Duration

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
          domComplete: 456 as Duration,
          domContentLoaded: 345 as Duration,
          domInteractive: 234 as Duration,
          firstContentfulPaint: 123 as Duration,
          largestContentfulPaint: 789 as Duration,
          loadEvent: 567 as Duration,
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
    it('should track error count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.errorCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.errorCount).toEqual(2)
      expect(getViewEvent(2).eventCounts.errorCount).toEqual(0)
    })

    it('should track long task count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.longTaskCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.LONG_TASK } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.longTaskCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.longTaskCount).toEqual(0)
    })

    it('should track resource count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)
    })

    it('should track action count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.userActionCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ACTION } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.userActionCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.userActionCount).toEqual(0)
    })

    it('should reset event count when the view changes', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
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

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)

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

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)

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
      spyOnProperty(PerformanceObserver, 'supportedEntryTypes', 'get').and.callFake(() =>
        isLayoutShiftSupported ? ['layout-shift'] : []
      )
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

describe('rum track custom timings', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View
  let addTiming: (name: string, time?: RelativeTime) => void

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .withFakeClock()
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        ;({ addTiming } = trackViews(location, lifeCycle))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should add custom timing to current view', () => {
    const { clock } = setupBuilder.build()
    history.pushState({}, '', '/bar')
    const currentViewId = getViewEvent(2).id
    clock.tick(20)
    addTiming('foo')

    const event = getViewEvent(3)
    expect(event.id).toEqual(currentViewId)
    expect(event.customTimings).toEqual({ foo: 20 as Duration })
  })

  it('should add multiple custom timings', () => {
    const { clock } = setupBuilder.build()
    clock.tick(20)
    addTiming('foo')

    clock.tick(10)
    addTiming('bar')

    const event = getViewEvent(2)
    expect(event.customTimings).toEqual({
      bar: 30 as Duration,
      foo: 20 as Duration,
    })
  })

  it('should update custom timing', () => {
    const { clock } = setupBuilder.build()
    clock.tick(20)
    addTiming('foo')

    clock.tick(10)
    addTiming('bar')

    let event = getViewEvent(2)
    expect(event.customTimings).toEqual({
      bar: 30 as Duration,
      foo: 20 as Duration,
    })

    clock.tick(20)
    addTiming('foo')

    event = getViewEvent(3)
    expect(event.customTimings).toEqual({
      bar: 30 as Duration,
      foo: 50 as Duration,
    })
  })

  it('should add custom timing with a specific time', () => {
    setupBuilder.build()

    addTiming('foo', 1234 as RelativeTime)

    expect(getViewEvent(1).customTimings).toEqual({
      foo: 1234 as Duration,
    })
  })

  it('should sanitized timing name', () => {
    setupBuilder.build()
    const warnSpy = spyOn(console, 'warn')

    addTiming('foo bar-qux.@zip_21%$*€👋', 1234 as RelativeTime)

    expect(getViewEvent(1).customTimings).toEqual({
      'foo_bar-qux.@zip_21_$____': 1234 as Duration,
    })
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('track hasReplay', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .withFakeClock()
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('sets hasReplay to false by default', () => {
    setupBuilder.build()
    expect(getViewEvent(0).hasReplay).toBe(false)
  })

  it('sets hasReplay to true when the recording starts', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)

    history.pushState({}, '', '/bar')

    expect(getViewEvent(1).hasReplay).toBe(true)
  })

  it('keeps hasReplay to true when the recording stops', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)
    lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)

    history.pushState({}, '', '/bar')

    expect(getViewEvent(1).hasReplay).toBe(true)
  })

  it('sets hasReplay to true when a new view is created after the recording starts', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)

    history.pushState({}, '', '/bar')

    expect(getViewEvent(2).hasReplay).toBe(true)
  })

  it('sets hasReplay to false when a new view is created after the recording stops', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)
    lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)

    history.pushState({}, '', '/bar')

    expect(getViewEvent(2).hasReplay).toBe(false)
  })
})
