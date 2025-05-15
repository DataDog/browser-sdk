import type { RelativeTime } from '@flashcatcloud/browser-core'
import { registerCleanupTask } from '@flashcatcloud/browser-core/test'
import { resetExperimentalFeatures, elapsed, ONE_SECOND } from '@flashcatcloud/browser-core'
import {
  appendElement,
  appendText,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../../test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { CumulativeLayoutShift } from './trackCumulativeLayoutShift'
import { isLayoutShiftSupported, MAX_WINDOW_DURATION, trackCumulativeLayoutShift } from './trackCumulativeLayoutShift'

interface StartCLSTrackingArgs {
  viewStart: RelativeTime
  isLayoutShiftSupported: boolean
}

describe('trackCumulativeLayoutShift', () => {
  let originalSupportedEntryTypes: PropertyDescriptor | undefined
  let clsCallback: jasmine.Spy<(csl: CumulativeLayoutShift) => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function startCLSTracking({
    viewStart = 0 as RelativeTime,
    isLayoutShiftSupported = true,
  }: Partial<StartCLSTrackingArgs> = {}) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    clsCallback = jasmine.createSpy()
    originalSupportedEntryTypes = Object.getOwnPropertyDescriptor(PerformanceObserver, 'supportedEntryTypes')
    Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
      get: () => (isLayoutShiftSupported ? ['layout-shift'] : []),
    })

    const clsTrackingResult = trackCumulativeLayoutShift(mockRumConfiguration(), viewStart, clsCallback)

    registerCleanupTask(() => {
      clsTrackingResult.stop()
      if (originalSupportedEntryTypes) {
        Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', originalSupportedEntryTypes)
      }
    })
  }

  beforeEach(() => {
    if (!isLayoutShiftSupported()) {
      pending('No LayoutShift API support')
    }
  })

  it('should be initialized to 0', () => {
    startCLSTracking()
    expect(clsCallback).toHaveBeenCalledOnceWith({ value: 0 })
  })

  it('should be initialized to undefined if layout-shift is not supported', () => {
    startCLSTracking({ viewStart: 0 as RelativeTime, isLayoutShiftSupported: false })

    expect(clsCallback).not.toHaveBeenCalled()
  })

  it('should accumulate layout shift values for the first session window', () => {
    startCLSTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 1 as RelativeTime }),
    ])

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 2 as RelativeTime }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0.3,
      time: 2 as RelativeTime,
      targetSelector: undefined,
      previousRect: undefined,
      currentRect: undefined,
      devicePixelRatio: jasmine.any(Number),
    })
  })

  it('should ignore layout shifts that happen before the view start', () => {
    startCLSTracking({ viewStart: 100 as RelativeTime })
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 1 as RelativeTime }),
    ])

    expect(clsCallback).toHaveBeenCalledTimes(1)
    expect(clsCallback.calls.mostRecent().args[0]).toEqual({
      value: 0,
    })
  })

  it('should round the cumulative layout shift value to 4 decimals', () => {
    startCLSTracking()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 1.23456789 })])

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 1.11111111111 })])

    expect(clsCallback).toHaveBeenCalledTimes(3)
    expect(clsCallback.calls.mostRecent().args[0].value).toEqual(2.3457)
  })

  it('should ignore entries with recent input', () => {
    startCLSTracking()
    notifyPerformanceEntries([
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
    startCLSTracking()
    // first session window
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 0 as RelativeTime }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 1 as RelativeTime }),
    ])
    // second session window
    notifyPerformanceEntries([
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
      previousRect: undefined,
      currentRect: undefined,
      devicePixelRatio: jasmine.any(Number),
    })
  })

  it('should create a new session window if the current session window is more than 5 second', () => {
    startCLSTracking()
    for (let i = 1; i <= 7; i++) {
      notifyPerformanceEntries([
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
      previousRect: undefined,
      currentRect: undefined,
      devicePixelRatio: jasmine.any(Number),
    })
  })

  it('should get the max value sessions', () => {
    startCLSTracking()
    // first session window: { value: 0.3, time: 1 }
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 0 as RelativeTime }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 1 as RelativeTime }),
    ])

    // second session window: { value: 0.5, time: 5002 }
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.1,
        startTime: (MAX_WINDOW_DURATION + 1) as RelativeTime,
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (MAX_WINDOW_DURATION + 2) as RelativeTime,
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (MAX_WINDOW_DURATION + 3) as RelativeTime,
      }),
    ])

    // third session window: { value: 0.4, time: 10003 }
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
        value: 0.2,
        startTime: (2 * MAX_WINDOW_DURATION + 3) as RelativeTime,
      }),
    ])
    notifyPerformanceEntries([
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
      previousRect: undefined,
      currentRect: undefined,
      devicePixelRatio: jasmine.any(Number),
    })
  })

  it('should get the time from the beginning of the view', () => {
    const viewStart = 100 as RelativeTime
    startCLSTracking({ viewStart, isLayoutShiftSupported: true })

    const shiftStart = 110 as RelativeTime
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: shiftStart }),
    ])

    expect(clsCallback.calls.mostRecent().args[0].time).toEqual(elapsed(viewStart, shiftStart))
  })

  describe('cls target element', () => {
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should return the first target element selector amongst all the shifted nodes', () => {
      startCLSTracking()
      const textNode = appendText('text')
      const divElement = appendElement('<div id="div-element"></div>')

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          sources: [
            {
              node: textNode,
              previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
              currentRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
            },
            {
              node: divElement,
              previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
              currentRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
            },
            {
              node: textNode,
              previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
              currentRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
            },
          ],
        }),
      ])

      expect(clsCallback).toHaveBeenCalledTimes(2)
      expect(clsCallback.calls.mostRecent().args[0].targetSelector).toEqual('#div-element')
    })

    it('should not return the target element when the element is detached from the DOM before the performance entry event is triggered', () => {
      startCLSTracking()
      // first session window
      notifyPerformanceEntries([
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

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: 1001 as RelativeTime,
          sources: [
            {
              node: divElement,
              previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
              currentRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
            },
          ],
        }),
      ])

      expect(clsCallback.calls.mostRecent().args[0].value).toEqual(0.2)
      expect(clsCallback.calls.mostRecent().args[0].targetSelector).toEqual(undefined)
    })

    it('should get the target element, time, and rects of the largest layout shift', () => {
      startCLSTracking()
      const divElement = appendElement('<div id="div-element"></div>')

      // first session window:  { value: 0.5, time: 1, targetSelector: '#div-element' }
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.1, startTime: 0 as RelativeTime }),
      ])
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: 1 as RelativeTime,
          sources: [
            {
              node: divElement,
              previousRect: DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 10, height: 10 }),
              currentRect: DOMRectReadOnly.fromRect({ x: 50, y: 50, width: 10, height: 10 }),
            },
          ],
        }),
      ])
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, { value: 0.2, startTime: 2 as RelativeTime }),
      ])

      // second session window:  { value: 0.4, time: 5002, targetSelector: undefined }
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT, {
          value: 0.2,
          startTime: (MAX_WINDOW_DURATION + 2) as RelativeTime,
        }),
      ])
      notifyPerformanceEntries([
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
        previousRect: { x: 0, y: 0, width: 10, height: 10 },
        currentRect: { x: 50, y: 50, width: 10, height: 10 },
        devicePixelRatio: jasmine.any(Number),
      })
    })
  })
})
