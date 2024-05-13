import { resetExperimentalFeatures } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../test'
import { appendElement, appendText, createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { CumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'

describe('trackCumulativeLayoutShift', () => {
  let setupBuilder: TestSetupBuilder
  let isLayoutShiftSupported: boolean
  let originalSupportedEntryTypes: PropertyDescriptor | undefined
  let clsCallback: jasmine.Spy<(csl: CumulativeLayoutShift) => void>

  beforeEach(() => {
    if (!('PerformanceObserver' in window) || !('supportedEntryTypes' in PerformanceObserver)) {
      pending('No PerformanceObserver support')
    }

    clsCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) =>
      trackCumulativeLayoutShift(configuration, lifeCycle, clsCallback)
    )

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
  })

  it('should be initialized to 0', () => {
    setupBuilder.build()

    expect(clsCallback).toHaveBeenCalledOnceWith({ value: 0 })
  })

  it('should be initialized to undefined if layout-shift is not supported', () => {
    isLayoutShiftSupported = false
    setupBuilder.build()

    expect(clsCallback).not.toHaveBeenCalled()
  })

  it('should accumulate layout shift values for the first session window', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
    ])
    clock.tick(100)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.3)
  })

  it('should round the cumulative layout shift value to 4 decimals', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 1.23456789 }),
    ])
    clock.tick(100)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 1.11111111111 }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(2.3457)
  })

  it('should ignore entries with recent input', () => {
    const { lifeCycle } = setupBuilder.withFakeClock().build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, hadRecentInput: true }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(1)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0)
  })

  it('should create a new session window if the gap is more than 1 second', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    // first session window
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
    ])
    clock.tick(100)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ]) // second session window
    clock.tick(1001)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.3)
  })

  it('should create a new session window if the current session window is more than 5 second', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0 }),
    ])

    for (let i = 0; i < 6; i += 1) {
      clock.tick(999)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
      ])
    } // window 1: 0.5 | window 2: 0.1

    expect(clsCallback).toHaveBeenCalledTimes(6)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.5)
  })

  it('should get the max value sessions', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

    // first session window
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ])
    // second session window
    clock.tick(5001)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ])
    // third session window
    clock.tick(5001)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(4)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({ value: 0.5, targetSelector: undefined })
  })

  describe('cls target element', () => {
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should return the first target element selector amongst all the shifted nodes', () => {
      const { lifeCycle } = setupBuilder.build()

      const textNode = appendText('text')
      const divElement = appendElement('<div id="div-element"></div>')

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          sources: [{ node: textNode }, { node: divElement }, { node: textNode }],
        }),
      ])

      expect(clsCallback).toHaveBeenCalledTimes(2)
      expect(clsCallback.calls.mostRecent().args[0].targetSelector).toEqual('#div-element')
    })

    it('should not return the target element when the element is detached from the DOM before the performance entry event is triggered', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      // first session window
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
        }),
      ])

      expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.2)

      clock.tick(1001)

      // second session window
      // first shift with an element
      const divElement = appendElement('<div id="div-element"></div>')
      divElement.remove()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          sources: [{ node: divElement }],
        }),
      ])
      // second shift that makes this window the maximum CLS
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
      ])

      expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.3)
      expect(clsCallback.calls.mostRecent().args[0].targetSelector).toEqual(undefined)
    })

    it('should get the target element of the largest layout shift', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const divElement = appendElement('<div id="div-element"></div>')

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1 }),
      ])
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, sources: [{ node: divElement }] }),
      ])
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
      ])

      // second session window
      clock.tick(5001)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
      ])
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2 }),
      ])

      expect(clsCallback).toHaveBeenCalledTimes(4)
      expect(clsCallback.calls.mostRecent().args[0]).toEqual({ value: 0.5, targetSelector: '#div-element' })
    })
  })
})
