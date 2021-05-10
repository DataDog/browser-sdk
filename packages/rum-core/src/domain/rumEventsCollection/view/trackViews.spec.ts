import { Duration, RelativeTime, ClocksState, clocksNow, Configuration } from '@datadog/browser-core'
import { setup, TestSetupBuilder, spyOnViews } from '../../../../test/specHelper'
import {
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { THROTTLE_VIEW_UPDATE_PERIOD, trackViews, ViewEvent, ViewCreatedEvent } from './trackViews'

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

const configuration: Partial<Configuration> = { isEnabled: () => true }

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
        return trackViews(location, lifeCycle, configuration as Configuration)
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
  let getViewEvent: (index: number) => ViewEvent

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
        return trackViews(location, lifeCycle, configuration as Configuration)
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
  let getViewEvent: (index: number) => ViewEvent

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeClock()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, configuration as Configuration)
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
  let getViewEvent: (index: number) => ViewEvent

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, configuration as Configuration)
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

describe('rum view timings', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getHandledCount: () => number
  let getViewEvent: (index: number) => ViewEvent

  beforeEach(() => {
    ;({ handler, getViewEvent, getHandledCount } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, configuration as Configuration)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

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
    let initialView: { init: ViewEvent; end: ViewEvent; last: ViewEvent }
    let secondView: { init: ViewEvent; last: ViewEvent }
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

describe('rum track custom timings', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent
  let addTiming: (name: string, endClocks?: ClocksState) => void

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .withFakeClock()
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        ;({ addTiming } = trackViews(location, lifeCycle, configuration as Configuration))
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
    const { clock } = setupBuilder.build()

    clock.tick(1234)
    addTiming('foo', clocksNow())

    expect(getViewEvent(1).customTimings).toEqual({
      foo: 1234 as Duration,
    })
  })

  it('should sanitized timing name', () => {
    const { clock } = setupBuilder.build()
    const warnSpy = spyOn(console, 'warn')

    clock.tick(1234)
    addTiming('foo bar-qux.@zip_21%$*€👋', clocksNow())

    expect(getViewEvent(1).customTimings).toEqual({
      'foo_bar-qux.@zip_21_$____': 1234 as Duration,
    })
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('track hasReplay', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .withFakeClock()
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, configuration as Configuration)
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
