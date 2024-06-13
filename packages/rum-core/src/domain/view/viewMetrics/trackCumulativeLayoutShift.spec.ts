import type { RelativeTime } from '@datadog/browser-core'
import { resetExperimentalFeatures, elapsed, ONE_SECOND } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../test'
import { appendElement, appendText, createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { CumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { MAX_WINDOW_DURATION, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'

describe('trackCumulativeLayoutShift', () => {
  let setupBuilder: TestSetupBuilder
  let isLayoutShiftSupported: boolean
  let originalSupportedEntryTypes: PropertyDescriptor | undefined
  let clsCallback: jasmine.Spy<(csl: CumulativeLayoutShift) => void>
  let viewStart: RelativeTime

  beforeEach(() => {
    if (
      !('PerformanceObserver' in window) ||
      !('supportedEntryTypes' in PerformanceObserver) ||
      !PerformanceObserver.supportedEntryTypes.includes('layout-shift')
    ) {
      pending('No LayoutShift API support')
    }

    clsCallback = jasmine.createSpy()
    viewStart = 0 as RelativeTime
    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) =>
      trackCumulativeLayoutShift(configuration, lifeCycle, viewStart, clsCallback)
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
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 1 as RelativeTime }),
    ])

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 2 as RelativeTime }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0.3,
      time: 2 as RelativeTime,
      targetSelector: undefined,
    })
  })

  it('should round the cumulative layout shift value to 4 decimals', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 1.23456789 }),
    ])

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 1.11111111111 }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(2.3457)
  })

  it('should ignore entries with recent input', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.1,
        hadRecentInput: true,
      }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(1)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0,
    })
  })

  it('should create a new session window if the gap is more than 1 second', () => {
    const { lifeCycle } = setupBuilder.build()
    // first session window
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 0 as RelativeTime }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 1 as RelativeTime }),
    ])
    // second session window
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.1,
        startTime: (1 + ONE_SECOND) as RelativeTime,
      }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0.3,
      time: 1 as RelativeTime,
      targetSelector: undefined,
    })
  })

  it('should create a new session window if the current session window is more than 5 second', () => {
    const { lifeCycle } = setupBuilder.build()

    for (let i = 1; i <= 7; i++) {
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.1,
          startTime: (i * 999) as RelativeTime,
        }),
      ])
    } // window 1: { value: 0.6, time: 999 } | window 2: { value: 0.1, time: 5994(6*999) }

    expect(clsCallback).toHaveBeenCalledTimes(7)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0.6,
      time: 999 as RelativeTime,
      targetSelector: undefined,
    })
  })

  it('should get the max value sessions', () => {
    const { lifeCycle } = setupBuilder.build()

    // first session window: { value: 0.3, time: 1 }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 0 as RelativeTime }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 1 as RelativeTime }),
    ])

    // second session window: { value: 0.5, time: 5002 }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.1,
        startTime: (MAX_WINDOW_DURATION + 1) as RelativeTime,
      }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (MAX_WINDOW_DURATION + 2) as RelativeTime,
      }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (MAX_WINDOW_DURATION + 3) as RelativeTime,
      }),
    ])

    // third session window: { value: 0.4, time: 10003 }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (2 * MAX_WINDOW_DURATION + 3) as RelativeTime,
      }),
    ])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (2 * MAX_WINDOW_DURATION + 4) as RelativeTime,
      }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(4)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0.5,
      time: 5002 as RelativeTime,
      targetSelector: undefined,
    })
  })

  it('should get the time from the beginning of the view', () => {
    viewStart = 100 as RelativeTime
    const { lifeCycle } = setupBuilder.build()
    const shiftStart = 110 as RelativeTime
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: shiftStart }),
    ])

    expect(clsCallback.calls.mostRecent().args[0].time).toEqual(elapsed(viewStart, shiftStart))
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
      const { lifeCycle } = setupBuilder.build()

      // first session window
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: 0 as RelativeTime,
        }),
      ])

      expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.2)

      // second session window
      // first shift with an element
      const divElement = appendElement('<div id="div-element"></div>')
      divElement.remove()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: 1001 as RelativeTime,
          sources: [{ node: divElement }],
        }),
      ])

      expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.2)
      expect(clsCallback.calls.mostRecent().args[0].targetSelector).toEqual(undefined)
    })

    it('should get the target element and time of the largest layout shift', () => {
      const { lifeCycle } = setupBuilder.build()
      const divElement = appendElement('<div id="div-element"></div>')

      // first session window:  { value: 0.5, time: 1, targetSelector: '#div-element' }
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 0 as RelativeTime }),
      ])
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: 1 as RelativeTime,
          sources: [{ node: divElement }],
        }),
      ])
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 2 as RelativeTime }),
      ])

      // second session window:  { value: 0.4, time: 5002, targetSelector: undefined }
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: (MAX_WINDOW_DURATION + 2) as RelativeTime,
        }),
      ])
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: (MAX_WINDOW_DURATION + 3) as RelativeTime,
        }),
      ])

      expect(clsCallback).toHaveBeenCalledTimes(4)
      expect(clsCallback.calls.mostRecent().args[0]).toEqual({
        value: 0.5,
        time: 1 as RelativeTime,
        targetSelector: '#div-element',
      })
    })
  })
})
