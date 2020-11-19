import { restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumPerformanceNavigationTiming, RumPerformancePaintTiming } from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import { resetFirstHidden } from './trackFirstHidden'
import { Timings, trackFirstContentfulPaint, trackNavigationTimings, trackTimings } from './trackTimings'

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
