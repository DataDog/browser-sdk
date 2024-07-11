import type { RelativeTime } from '@datadog/browser-core'
import { resetExperimentalFeatures, elapsed, ONE_SECOND } from '@datadog/browser-core'
import { appendElement, appendText, createPerformanceEntry } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { RumConfiguration } from '../../configuration'
import type { CumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { MAX_WINDOW_DURATION, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'

describe('trackCumulativeLayoutShift', () => {
  const lifeCycle = new LifeCycle()
  let isLayoutShiftSupported: boolean
  let originalSupportedEntryTypes: PropertyDescriptor | undefined
  let clsCallback: jasmine.Spy<(csl: CumulativeLayoutShift) => void>
  let viewStart: RelativeTime
  let cleanup: () => void

  function startCLSTracking() {
    clsCallback = jasmine.createSpy()

    const clsTrackingesult = trackCumulativeLayoutShift({} as RumConfiguration, lifeCycle, viewStart, clsCallback)
    cleanup = clsTrackingesult.stop
  }

  beforeEach(() => {
    if (
      !window.PerformanceObserver ||
      !PerformanceObserver.supportedEntryTypes ||
      !PerformanceObserver.supportedEntryTypes.includes('layout-shift')
    ) {
      pending('No LayoutShift API support')
    }

    viewStart = 0 as RelativeTime
    startCLSTracking()

    originalSupportedEntryTypes = Object.getOwnPropertyDescriptor(PerformanceObserver, 'supportedEntryTypes')
    isLayoutShiftSupported = true
    Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
      get: () => (isLayoutShiftSupported ? ['layout-shift'] : []),
    })
  })

  afterEach(() => {
    cleanup()
    if (originalSupportedEntryTypes) {
      Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', originalSupportedEntryTypes)
    }
  })

  it('should be initialized to 0', () => {
    expect(clsCallback).toHaveBeenCalledOnceWith({ value: 0 })
  })

  it('should be initialized to undefined if layout-shift is not supported', () => {
    // stop the previous tracking from beforeEach
    cleanup()

    isLayoutShiftSupported = false
    startCLSTracking()

    expect(clsCallback).not.toHaveBeenCalled()
  })

  it('should accumulate layout shift values for the first session window', () => {
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
    // stop the previous tracking from beforeEach
    cleanup()

    viewStart = 100 as RelativeTime
    startCLSTracking()

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
