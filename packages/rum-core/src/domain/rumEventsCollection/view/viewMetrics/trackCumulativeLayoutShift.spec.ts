import { relativeNow } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import type { LifeCycle } from '../../../lifeCycle'
import { LifeCycleEventType } from '../../../lifeCycle'
import { THROTTLE_VIEW_UPDATE_PERIOD } from '../trackViews'
import type { ViewTest } from '../setupViewTest.specHelper'
import { setupViewTest } from '../setupViewTest.specHelper'

describe('trackCumulativeLayoutShift', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest
  let isLayoutShiftSupported: boolean
  let originalSupportedEntryTypes: PropertyDescriptor | undefined

  function newLayoutShift(lifeCycle: LifeCycle, { value = 0.1, hadRecentInput = false }) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        entryType: 'layout-shift',
        startTime: relativeNow(),
        hadRecentInput,
        value,
      },
    ])
  }

  beforeEach(() => {
    if (!('PerformanceObserver' in window) || !('supportedEntryTypes' in PerformanceObserver)) {
      pending('No PerformanceObserver support')
    }
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
    originalSupportedEntryTypes = Object.getOwnPropertyDescriptor(PerformanceObserver, 'supportedEntryTypes')
    isLayoutShiftSupported = true
    Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
      get: () => (isLayoutShiftSupported ? ['layout-shift'] : []),
    })
  })

  afterEach(() => {
    if (originalSupportedEntryTypes) {
      Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', originalSupportedEntryTypes)
    }
    setupBuilder.cleanup()
  })

  it('should be initialized to 0', () => {
    setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).commonViewMetrics.cumulativeLayoutShift).toBe(0)
  })

  it('should be initialized to undefined if layout-shift is not supported', () => {
    isLayoutShiftSupported = false
    setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).commonViewMetrics.cumulativeLayoutShift).toBe(undefined)
  })

  it('should accumulate layout shift values for the first session window', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest
    newLayoutShift(lifeCycle, { value: 0.1 })
    clock.tick(100)
    newLayoutShift(lifeCycle, { value: 0.2 })
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.cumulativeLayoutShift).toBe(0.3)
  })

  it('should round the cumulative layout shift value to 4 decimals', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest
    newLayoutShift(lifeCycle, { value: 1.23456789 })
    clock.tick(100)
    newLayoutShift(lifeCycle, { value: 1.11111111111 })
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.cumulativeLayoutShift).toBe(2.3457)
  })

  it('should ignore entries with recent input', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    newLayoutShift(lifeCycle, { value: 0.1, hadRecentInput: true })

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(1)
    expect(getViewUpdate(0).commonViewMetrics.cumulativeLayoutShift).toBe(0)
  })

  it('should create a new session window if the gap is more than 1 second', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest
    // first session window
    newLayoutShift(lifeCycle, { value: 0.1 })
    clock.tick(100)
    newLayoutShift(lifeCycle, { value: 0.2 })
    // second session window
    clock.tick(1001)
    newLayoutShift(lifeCycle, { value: 0.1 })

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.cumulativeLayoutShift).toBe(0.3)
  })

  it('should create a new session window if the current session window is more than 5 second', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest
    newLayoutShift(lifeCycle, { value: 0 })
    for (let i = 0; i < 6; i += 1) {
      clock.tick(999)
      newLayoutShift(lifeCycle, { value: 0.1 })
    } // window 1: 0.5 | window 2: 0.1
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(2).commonViewMetrics.cumulativeLayoutShift).toBe(0.5)
  })

  it('should get the max value sessions', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest
    // first session window
    newLayoutShift(lifeCycle, { value: 0.1 })
    newLayoutShift(lifeCycle, { value: 0.2 })
    // second session window
    clock.tick(5001)
    newLayoutShift(lifeCycle, { value: 0.1 })
    newLayoutShift(lifeCycle, { value: 0.2 })
    newLayoutShift(lifeCycle, { value: 0.2 })
    // third session window
    clock.tick(5001)
    newLayoutShift(lifeCycle, { value: 0.2 })
    newLayoutShift(lifeCycle, { value: 0.2 })

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(2).commonViewMetrics.cumulativeLayoutShift).toBe(0.5)
  })
})
