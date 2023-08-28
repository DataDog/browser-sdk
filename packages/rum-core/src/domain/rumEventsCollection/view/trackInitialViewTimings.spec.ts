import type { Duration, RelativeTime } from '@datadog/browser-core'
import { DOM_EVENT } from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility, createNewEvent } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../test'
import { noopWebVitalTelemetryDebug, setup } from '../../../../test'
import type {
  RumFirstInputTiming,
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { resetFirstHidden } from './trackFirstHidden'
import type { Timings } from './trackInitialViewTimings'
import {
  KEEP_TRACKING_TIMINGS_AFTER_VIEW_DELAY,
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
  element: document.createElement('div'),
}

const FAKE_FIRST_INPUT_ENTRY: RumFirstInputTiming = {
  entryType: 'first-input',
  processingStart: 1100 as RelativeTime,
  startTime: 1000 as RelativeTime,
  target: document.createElement('button'),
  duration: 0 as Duration,
}

describe('trackInitialViewTimings', () => {
  let setupBuilder: TestSetupBuilder
  let scheduleViewUpdateSpy: jasmine.Spy<() => void>
  let trackInitialViewTimingsResult: ReturnType<typeof trackInitialViewTimings>
  let setLoadEventSpy: jasmine.Spy<(loadEvent: Duration) => void>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    scheduleViewUpdateSpy = jasmine.createSpy()
    setLoadEventSpy = jasmine.createSpy()

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      trackInitialViewTimingsResult = trackInitialViewTimings(
        lifeCycle,
        configuration,
        noopWebVitalTelemetryDebug,
        setLoadEventSpy,
        scheduleViewUpdateSpy
      )
      return trackInitialViewTimingsResult
    })
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

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(3)
    expect(trackInitialViewTimingsResult.timings).toEqual({
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

  it('allows delaying the stop logic', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    trackInitialViewTimingsResult.scheduleStop()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(1)

    clock.tick(KEEP_TRACKING_TIMINGS_AFTER_VIEW_DELAY)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_PAINT_ENTRY])

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(1)
  })

  it('calls the `setLoadEvent` callback when the loadEvent timing is known', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      FAKE_NAVIGATION_ENTRY,
      FAKE_PAINT_ENTRY,
      FAKE_FIRST_INPUT_ENTRY,
    ])

    expect(setLoadEventSpy).toHaveBeenCalledOnceWith(567 as Duration)
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
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fcpCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) =>
      trackFirstContentfulPaintTiming(lifeCycle, configuration, fcpCallback)
    )
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
  let lcpCallback: jasmine.Spy<(value: RelativeTime, lcpElement: Element | undefined) => void>
  let eventTarget: Window
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    lcpCallback = jasmine.createSpy()
    eventTarget = document.createElement('div') as unknown as Window
    setupBuilder = setup().beforeBuild(({ lifeCycle }) =>
      trackLargestContentfulPaintTiming(lifeCycle, configuration, eventTarget, lcpCallback)
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
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, jasmine.any(Element))
  })

  it('should be discarded if it is reported after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

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
    ({
      firstInputDelay,
      firstInputTime,
    }: {
      firstInputDelay: number
      firstInputTime: number
      firstInputTarget: Node | undefined
    }) => void
  >
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fitCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackFirstInputTimings(lifeCycle, configuration, fitCallback))
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
    expect(fitCallback).toHaveBeenCalledWith({
      firstInputDelay: 100,
      firstInputTime: 1000,
      firstInputTarget: jasmine.any(Node),
    })
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
        duration: 0 as Duration,
      },
    ])

    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith({ firstInputDelay: 0, firstInputTime: 1000, firstInputTarget: undefined })
  })
})
