import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import {
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import { resetFirstHidden } from './trackFirstHidden'
import {
  Timings,
  trackFirstContentfulPaint,
  trackLargestContentfulPaint,
  trackNavigationTimings,
  trackTimings,
} from './trackTimings'

const FAKE_PAINT_ENTRY: RumPerformancePaintTiming = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123,
}

const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  domComplete: 456,
  domContentLoadedEventEnd: 345,
  domInteractive: 234,
  entryType: 'navigation',
  loadEventEnd: 567,
}

const FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY: RumLargestContentfulPaintTiming = {
  entryType: 'largest-contentful-paint',
  startTime: 789,
}

describe('trackTimings', () => {
  let setupBuilder: TestSetupBuilder
  let spy: jasmine.Spy<(value: Partial<Timings>) => void>

  beforeEach(() => {
    spy = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackTimings(lifeCycle, spy)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should merge timings from various sources', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.calls.mostRecent().args[0]).toEqual({
      domComplete: 456,
      domContentLoaded: 345,
      domInteractive: 234,
      firstContentfulPaint: 123,
      loadEventEnd: 567,
    })
  })
})

describe('trackNavigationTimings', () => {
  let setupBuilder: TestSetupBuilder
  let spy: jasmine.Spy<(value: Partial<Timings>) => void>

  beforeEach(() => {
    spy = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackNavigationTimings(lifeCycle, spy)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({
      domComplete: 456,
      domContentLoaded: 345,
      domInteractive: 234,
      loadEventEnd: 567,
    })
  })
})

describe('trackFirstContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let spy: jasmine.Spy<(value: number) => void>

  beforeEach(() => {
    spy = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackFirstContentfulPaint(lifeCycle, spy)
    })
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(123)
  })

  it('should not set the first contentful paint if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('largestContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let spy: jasmine.Spy<(value: number) => void>
  let emitter: Element

  beforeEach(() => {
    spy = jasmine.createSpy()
    emitter = document.createElement('div')
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackLargestContentfulPaint(lifeCycle, emitter, spy)
    })
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the largest contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(789)
  })

  it('should not be present if it happens after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    const event = createNewEvent(DOM_EVENT.KEY_DOWN)
    Object.defineProperty(event, 'timeStamp', {
      get() {
        return 1
      },
    })
    emitter.dispatchEvent(event)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)
    expect(spy).not.toHaveBeenCalled()
  })

  it('should not be present if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)

    expect(spy).not.toHaveBeenCalled()
  })
})
