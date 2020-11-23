import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import {
  RumFirstInputTiming,
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import { resetFirstHidden } from './trackFirstHidden'
import {
  Timings,
  trackFirstContentfulPaint,
  trackFirstInputDelay,
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

const FAKE_FIRST_INPUT_ENTRY: RumFirstInputTiming = {
  entryType: 'first-input',
  processingStart: 1100,
  startTime: 1000,
}

describe('trackTimings', () => {
  let setupBuilder: TestSetupBuilder
  let timingsCallback: jasmine.Spy<(value: Partial<Timings>) => void>

  beforeEach(() => {
    timingsCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackTimings(lifeCycle, timingsCallback)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should merge timings from various sources', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_FIRST_INPUT_ENTRY)

    expect(timingsCallback).toHaveBeenCalledTimes(3)
    expect(timingsCallback.calls.mostRecent().args[0]).toEqual({
      domComplete: 456,
      domContentLoaded: 345,
      domInteractive: 234,
      firstContentfulPaint: 123,
      firstInputDelay: 100,
      loadEventEnd: 567,
    })
  })
})

describe('trackNavigationTimings', () => {
  let setupBuilder: TestSetupBuilder
  let navigationTimingsCallback: jasmine.Spy<(value: Partial<Timings>) => void>

  beforeEach(() => {
    navigationTimingsCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackNavigationTimings(lifeCycle, navigationTimingsCallback)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)

    expect(navigationTimingsCallback).toHaveBeenCalledTimes(1)
    expect(navigationTimingsCallback).toHaveBeenCalledWith({
      domComplete: 456,
      domContentLoaded: 345,
      domInteractive: 234,
      loadEventEnd: 567,
    })
  })
})

describe('trackFirstContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let fcpCallback: jasmine.Spy<(value: number) => void>

  beforeEach(() => {
    fcpCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackFirstContentfulPaint(lifeCycle, fcpCallback)
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

    expect(fcpCallback).toHaveBeenCalledTimes(1)
    expect(fcpCallback).toHaveBeenCalledWith(123)
  })

  it('should not set the first contentful paint if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY)
    expect(fcpCallback).not.toHaveBeenCalled()
  })
})

describe('largestContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let lcpCallback: jasmine.Spy<(value: number) => void>
  let emitter: Element

  beforeEach(() => {
    lcpCallback = jasmine.createSpy()
    emitter = document.createElement('div')
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackLargestContentfulPaint(lifeCycle, emitter, lcpCallback)
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
    expect(lcpCallback).toHaveBeenCalledTimes(1)
    expect(lcpCallback).toHaveBeenCalledWith(789)
  })

  it('should not be present if it happens after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    emitter.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)
    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should not be present if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY)

    expect(lcpCallback).not.toHaveBeenCalled()
  })
})

describe('firstInputDelay', () => {
  let setupBuilder: TestSetupBuilder
  let fidCallback: jasmine.Spy<(value: number) => void>

  beforeEach(() => {
    fidCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      return trackFirstInputDelay(lifeCycle, fidCallback)
    })
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the first input delay', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_FIRST_INPUT_ENTRY)
    expect(fidCallback).toHaveBeenCalledTimes(1)
    expect(fidCallback).toHaveBeenCalledWith(100)
  })

  it('should not be present if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_FIRST_INPUT_ENTRY)

    expect(fidCallback).not.toHaveBeenCalled()
  })
})
