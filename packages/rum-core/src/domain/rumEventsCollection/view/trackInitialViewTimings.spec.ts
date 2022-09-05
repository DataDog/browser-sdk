import type { Duration, RelativeTime } from '@datadog/browser-core'
import { DOM_EVENT } from '@datadog/browser-core'
import { createNewEvent, restorePageVisibility, setPageVisibility } from '../../../../../core/test/specHelper'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import type {
  RumFirstInputTiming,
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import { resetFirstHidden } from './trackFirstHidden'
import type { Timings } from './trackInitialViewTimings'
import {
  trackFirstContentfulPaintTiming,
  trackFirstInputTimings,
  trackLargestContentfulPaintTiming,
  trackNavigationTimings,
  trackInitialViewTimings,
  TIMING_MAXIMUM_DELAY,
} from './trackInitialViewTimings'

const FAKE_PAINT_ENTRY: RumPerformancePaintTiming = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123 as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  responseStart: 123 as RelativeTime,
  domComplete: 456 as RelativeTime,
  domContentLoadedEventEnd: 345 as RelativeTime,
  domInteractive: 234 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: 567 as RelativeTime,
}

const FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY: RumLargestContentfulPaintTiming = {
  entryType: 'largest-contentful-paint',
  startTime: 789 as RelativeTime,
  size: 10,
}

const FAKE_FIRST_INPUT_ENTRY: RumFirstInputTiming = {
  entryType: 'first-input',
  processingStart: 1100 as RelativeTime,
  startTime: 1000 as RelativeTime,
}

describe('trackTimings', () => {
  let setupBuilder: TestSetupBuilder
  let timingsCallback: jasmine.Spy<(value: Partial<Timings>) => void>

  beforeEach(() => {
    timingsCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackInitialViewTimings(lifeCycle, timingsCallback))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should merge timings from various sources', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      FAKE_NAVIGATION_ENTRY,
      FAKE_PAINT_ENTRY,
      FAKE_FIRST_INPUT_ENTRY,
    ])

    expect(timingsCallback).toHaveBeenCalledTimes(3)
    expect(timingsCallback.calls.mostRecent().args[0]).toEqual({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      firstContentfulPaint: 123 as Duration,
      firstInputDelay: 100 as Duration,
      firstInputTime: 1000 as Duration,
      loadEvent: 567 as Duration,
    })
  })
})

describe('trackNavigationTimings', () => {
  let setupBuilder: TestSetupBuilder
  let navigationTimingsCallback: jasmine.Spy<(value: Partial<Timings>) => void>

  beforeEach(() => {
    navigationTimingsCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackNavigationTimings(lifeCycle, navigationTimingsCallback))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])

    expect(navigationTimingsCallback).toHaveBeenCalledTimes(1)
    expect(navigationTimingsCallback).toHaveBeenCalledWith({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      loadEvent: 567 as Duration,
    })
  })
})

describe('trackFirstContentfulPaintTiming', () => {
  let setupBuilder: TestSetupBuilder
  let fcpCallback: jasmine.Spy<(value: RelativeTime) => void>

  beforeEach(() => {
    fcpCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackFirstContentfulPaintTiming(lifeCycle, fcpCallback))
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_PAINT_ENTRY])

    expect(fcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(fcpCallback).toHaveBeenCalledWith(123 as RelativeTime)
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_PAINT_ENTRY])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        ...FAKE_PAINT_ENTRY,
        startTime: TIMING_MAXIMUM_DELAY as RelativeTime,
      },
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })
})

describe('largestContentfulPaintTiming', () => {
  let setupBuilder: TestSetupBuilder
  let lcpCallback: jasmine.Spy<(value: RelativeTime) => void>
  let emitter: Element

  beforeEach(() => {
    lcpCallback = jasmine.createSpy()
    emitter = document.createElement('div')
    setupBuilder = setup().beforeBuild(({ lifeCycle }) =>
      trackLargestContentfulPaintTiming(lifeCycle, emitter, lcpCallback)
    )
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the largest contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY])
    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime)
  })

  it('should be discarded if it is reported after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    emitter.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY])
    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        ...FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY,
        startTime: TIMING_MAXIMUM_DELAY as RelativeTime,
      },
    ])
    expect(lcpCallback).not.toHaveBeenCalled()
  })
})

describe('firstInputTimings', () => {
  let setupBuilder: TestSetupBuilder
  let fitCallback: jasmine.Spy<
    ({ firstInputDelay, firstInputTime }: { firstInputDelay: number; firstInputTime: number }) => void
  >

  beforeEach(() => {
    fitCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackFirstInputTimings(lifeCycle, fitCallback))
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the first input timings', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_FIRST_INPUT_ENTRY])
    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith({ firstInputDelay: 100, firstInputTime: 1000 })
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_FIRST_INPUT_ENTRY])

    expect(fitCallback).not.toHaveBeenCalled()
  })

  it('should be adjusted to 0 if the computed value would be negative due to browser timings imprecisions', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        entryType: 'first-input' as const,
        processingStart: 900 as RelativeTime,
        startTime: 1000 as RelativeTime,
      },
    ])

    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith({ firstInputDelay: 0, firstInputTime: 1000 })
  })
})
