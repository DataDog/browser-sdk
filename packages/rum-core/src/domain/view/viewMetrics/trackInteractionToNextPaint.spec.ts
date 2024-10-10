import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, resetExperimentalFeatures } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  appendElement,
  appendText,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../../test'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type {
  BrowserWindow,
  RumFirstInputTiming,
  RumPerformanceEntry,
  RumPerformanceEventTiming,
} from '../../../browser/performanceObservable'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import {
  trackInteractionToNextPaint,
  trackViewInteractionCount,
  isInteractionToNextPaintSupported,
  MAX_INP_VALUE,
} from './trackInteractionToNextPaint'

describe('trackInteractionToNextPaint', () => {
  let interactionCountMock: ReturnType<typeof mockInteractionCount>
  let getInteractionToNextPaint: ReturnType<typeof trackInteractionToNextPaint>['getInteractionToNextPaint']
  let setViewEnd: ReturnType<typeof trackInteractionToNextPaint>['setViewEnd']
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function newInteraction(overrides: Partial<RumPerformanceEventTiming | RumFirstInputTiming>) {
    if (overrides.interactionId) {
      interactionCountMock.incrementInteractionCount()
    }
    const entry = createPerformanceEntry(overrides.entryType || RumPerformanceEntryType.EVENT, overrides)
    notifyPerformanceEntries([entry])
  }

  function startINPTracking(viewStart = 0 as RelativeTime) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    interactionCountMock = mockInteractionCount()

    const interactionToNextPaintTracking = trackInteractionToNextPaint(
      mockRumConfiguration(),
      viewStart,
      ViewLoadingType.INITIAL_LOAD
    )
    getInteractionToNextPaint = interactionToNextPaintTracking.getInteractionToNextPaint
    setViewEnd = interactionToNextPaintTracking.setViewEnd

    registerCleanupTask(() => {
      interactionToNextPaintTracking.stop
      resetExperimentalFeatures()
      interactionCountMock.clear()
    })
  }

  beforeEach(() => {
    if (!isInteractionToNextPaintSupported()) {
      pending('No INP support')
    }
  })

  it('should return undefined when there are no interactions', () => {
    startINPTracking()
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should ignore entries without interactionId', () => {
    startINPTracking()
    newInteraction({
      interactionId: undefined,
    })
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should ignore entries that starts out of the view time bounds', () => {
    startINPTracking()
    setViewEnd(10 as RelativeTime)

    newInteraction({
      name: 'pointerup',
      interactionId: 1,
      duration: 10 as Duration,
      startTime: -1 as RelativeTime,
      processingStart: 0 as RelativeTime,
      processingEnd: 6 as RelativeTime,
    })
    newInteraction({
      name: 'pointerup',
      interactionId: 2,
      duration: 10 as Duration,
      startTime: 11 as RelativeTime,
      processingStart: 12 as RelativeTime,
      processingEnd: 16 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should take into account entries that starts in view time bounds but finish after view end', () => {
    startINPTracking()
    setViewEnd(10 as RelativeTime)

    newInteraction({
      name: 'pointerup',
      interactionId: 1,
      duration: 100 as Duration,
      startTime: 1 as RelativeTime,
      processingStart: 2 as RelativeTime,
      processingEnd: 80 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual({
      value: 100 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      type: 'pointerup',
      input: 1 as Duration,
      process: 78 as Duration,
      render: 21 as Duration,
    })
  })

  it('should cap INP value', () => {
    startINPTracking()
    newInteraction({
      name: 'pointerup',
      interactionId: 1,
      duration: (MAX_INP_VALUE + 1) as Duration,
      startTime: 10 as RelativeTime,
      processingStart: 15 as RelativeTime,
      processingEnd: 80 as RelativeTime,
    })

    expect(getInteractionToNextPaint()).toEqual({
      value: MAX_INP_VALUE,
      targetSelector: undefined,
      time: 10 as RelativeTime,
      type: 'pointerup',
      input: 5 as Duration,
      process: 65 as Duration,
      render: (MAX_INP_VALUE + 10 - 80 + 1) as Duration,
    })
  })

  it('should return the p98 worst interaction', () => {
    startINPTracking()
    for (let index = 1; index <= 100; index++) {
      newInteraction({
        duration: index as Duration,
        interactionId: index,
        startTime: 1 as RelativeTime,
        name: 'pointerup',
        processingStart: 1 as RelativeTime,
        processingEnd: index as RelativeTime,
      })
    }
    expect(getInteractionToNextPaint()).toEqual({
      value: 98 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      type: 'pointerup',
      input: 0 as RelativeTime,
      process: 97 as RelativeTime,
      render: 1 as RelativeTime,
    })
  })

  it('should return 0 when an interaction happened without generating a performance event (interaction duration below 40ms)', () => {
    startINPTracking()
    interactionCountMock.setInteractionCount(1 as Duration) // assumes an interaction happened but no PERFORMANCE_ENTRIES_COLLECTED have been triggered
    expect(getInteractionToNextPaint()).toEqual({ value: 0 as Duration })
  })

  it('should take first-input entry into account', () => {
    startINPTracking()
    newInteraction({
      interactionId: 1,
      entryType: RumPerformanceEntryType.FIRST_INPUT,
      startTime: 1 as RelativeTime,
      name: 'pointerup',
      processingStart: 1 as RelativeTime,
      processingEnd: 5 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual({
      value: 40 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      type: 'pointerup',
      input: 0 as RelativeTime,
      process: 4 as RelativeTime,
      render: 36 as RelativeTime,
    })
  })

  it('should replace the entry in the list of worst interactions when an entry with the same interactionId exist', () => {
    startINPTracking()
    for (let index = 1; index <= 100; index++) {
      newInteraction({
        duration: index as Duration,
        interactionId: 1,
        startTime: 1 as RelativeTime,
        name: 'pointerup',
        processingStart: 1 as RelativeTime,
        processingEnd: index as RelativeTime,
      })
    }
    // the p98 return 100 which shows that the entry has been updated
    expect(getInteractionToNextPaint()).toEqual({
      value: 100 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      type: 'pointerup',
      input: 0 as Duration,
      process: 99 as Duration,
      render: 1 as Duration,
    })
  })

  it('should get the time from the beginning of the view', () => {
    const viewStart = 100 as RelativeTime
    startINPTracking(viewStart)

    const interactionStart = 110 as RelativeTime
    newInteraction({
      interactionId: 1,
      duration: 10 as Duration,
      startTime: interactionStart,
    })
    expect(getInteractionToNextPaint()!.time).toEqual(elapsed(viewStart, interactionStart))
  })

  describe('target selector', () => {
    it('should be returned', () => {
      startINPTracking()
      newInteraction({
        interactionId: 2,
        target: appendElement('<button id="inp-target-element"></button>'),
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual('#inp-target-element')
    })

    it("should not be returned if it's not a DOM element", () => {
      startINPTracking()
      newInteraction({
        interactionId: 2,
        target: appendText('text'),
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual(undefined)
    })

    it('should not be recomputed if the INP has not changed', () => {
      startINPTracking()
      const element = appendElement('<button id="foo"></button>')
      newInteraction({
        interactionId: 1,
        duration: 10 as Duration,
        target: element,
      })

      element.setAttribute('id', 'bar')

      newInteraction({
        interactionId: 2,
        duration: 9 as Duration,
        target: element,
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual('#foo')
    })

    it('should be recomputed if the INP has changed', () => {
      startINPTracking()
      newInteraction({
        interactionId: 1,
        duration: 10 as Duration,
        target: appendElement('<button id="foo"></button>'),
      })

      newInteraction({
        interactionId: 2,
        duration: 11 as Duration,
        target: appendElement('<button id="bar"></button>'),
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual('#bar')
    })
  })
})

describe('trackViewInteractionCount', () => {
  let interactionCountMock: ReturnType<typeof mockInteractionCount>

  beforeEach(() => {
    interactionCountMock = mockInteractionCount()
    interactionCountMock.setInteractionCount(5 as Duration)
  })
  afterEach(() => {
    interactionCountMock.clear()
  })

  it('should count the interaction happening since the time origin when view loading type is initial_load', () => {
    const { getViewInteractionCount } = trackViewInteractionCount(ViewLoadingType.INITIAL_LOAD)

    expect(getViewInteractionCount()).toEqual(5)
  })

  it('should count the interaction from the moment the function is called when view loading type is route_change', () => {
    const { getViewInteractionCount } = trackViewInteractionCount(ViewLoadingType.ROUTE_CHANGE)

    expect(getViewInteractionCount()).toEqual(0)
  })

  it('should return the the last interaction count once stopped', () => {
    const { getViewInteractionCount, stopViewInteractionCount } = trackViewInteractionCount(
      ViewLoadingType.ROUTE_CHANGE
    )
    interactionCountMock.incrementInteractionCount()
    stopViewInteractionCount()
    interactionCountMock.incrementInteractionCount()
    expect(getViewInteractionCount()).toEqual(1)
  })
})

function mockInteractionCount() {
  let interactionCount = 0
  const originalInteractionCount = Object.getOwnPropertyDescriptor(window.performance, 'interactionCount')
  Object.defineProperty(window.performance, 'interactionCount', { get: () => interactionCount, configurable: true })

  return {
    setInteractionCount: (newInteractionCount: Duration) => {
      interactionCount = newInteractionCount
    },
    incrementInteractionCount() {
      interactionCount++
    },
    clear: () => {
      if (originalInteractionCount) {
        Object.defineProperty(window.performance, 'interactionCount', originalInteractionCount)
      } else {
        delete (window as BrowserWindow).performance.interactionCount
      }
    },
  }
}
