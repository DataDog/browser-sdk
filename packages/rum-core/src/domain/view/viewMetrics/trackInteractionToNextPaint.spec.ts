import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, resetExperimentalFeatures } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement, appendText, createPerformanceEntry } from '../../../../test'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type {
  BrowserWindow,
  RumFirstInputTiming,
  RumPerformanceEventTiming,
} from '../../../browser/performanceObservable'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import {
  trackInteractionToNextPaint,
  trackViewInteractionCount,
  isInteractionToNextPaintSupported,
  MAX_INP_VALUE,
} from './trackInteractionToNextPaint'

describe('trackInteractionToNextPaint', () => {
  const lifeCycle = new LifeCycle()
  let interactionCountMock: ReturnType<typeof mockInteractionCount>
  let getInteractionToNextPaint: ReturnType<typeof trackInteractionToNextPaint>['getInteractionToNextPaint']
  let setViewEnd: ReturnType<typeof trackInteractionToNextPaint>['setViewEnd']
  let cleanup: () => void
  let viewStart: RelativeTime

  function newInteraction(lifeCycle: LifeCycle, overrides: Partial<RumPerformanceEventTiming | RumFirstInputTiming>) {
    if (overrides.interactionId) {
      interactionCountMock.incrementInteractionCount()
    }
    const entry = createPerformanceEntry(overrides.entryType || RumPerformanceEntryType.EVENT, overrides)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [entry])
  }

  function startINPTracking() {
    const interactionToNextPaintTracking = trackInteractionToNextPaint(
      {} as RumConfiguration,
      viewStart,
      ViewLoadingType.INITIAL_LOAD,
      lifeCycle
    )
    getInteractionToNextPaint = interactionToNextPaintTracking.getInteractionToNextPaint
    setViewEnd = interactionToNextPaintTracking.setViewEnd
    cleanup = interactionToNextPaintTracking.stop
  }

  beforeEach(() => {
    if (!isInteractionToNextPaintSupported()) {
      pending('No INP support')
    }
    interactionCountMock = mockInteractionCount()

    viewStart = 0 as RelativeTime
    startINPTracking()

    registerCleanupTask(() => {
      cleanup()
      resetExperimentalFeatures()
      interactionCountMock.clear()
    })
  })

  it('should return undefined when there are no interactions', () => {
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should ignore entries without interactionId', () => {
    newInteraction(lifeCycle, {
      interactionId: undefined,
    })
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should ignore entries that starts out of the view time bounds', () => {
    setViewEnd(10 as RelativeTime)

    newInteraction(lifeCycle, {
      interactionId: 1,
      duration: 10 as Duration,
      startTime: -1 as RelativeTime,
    })
    newInteraction(lifeCycle, {
      interactionId: 2,
      duration: 10 as Duration,
      startTime: 11 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should take into account entries that starts in view time bounds but finish after view end', () => {
    setViewEnd(10 as RelativeTime)

    newInteraction(lifeCycle, {
      interactionId: 1,
      duration: 100 as Duration,
      startTime: 1 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual({
      value: 100 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
    })
  })

  it('should cap INP value', () => {
    newInteraction(lifeCycle, {
      interactionId: 1,
      duration: (MAX_INP_VALUE + 1) as Duration,
      startTime: 1 as RelativeTime,
    })

    expect(getInteractionToNextPaint()).toEqual({
      value: MAX_INP_VALUE,
      targetSelector: undefined,
      time: 1 as RelativeTime,
    })
  })

  it('should return the p98 worst interaction', () => {
    for (let index = 1; index <= 100; index++) {
      newInteraction(lifeCycle, {
        duration: index as Duration,
        interactionId: index,
        startTime: index as RelativeTime,
      })
    }
    expect(getInteractionToNextPaint()).toEqual({
      value: 98 as Duration,
      targetSelector: undefined,
      time: 98 as RelativeTime,
    })
  })

  it('should return 0 when an interaction happened without generating a performance event (interaction duration below 40ms)', () => {
    interactionCountMock.setInteractionCount(1 as Duration) // assumes an interaction happened but no PERFORMANCE_ENTRIES_COLLECTED have been triggered
    expect(getInteractionToNextPaint()).toEqual({ value: 0 as Duration })
  })

  it('should take first-input entry into account', () => {
    newInteraction(lifeCycle, {
      interactionId: 1,
      entryType: RumPerformanceEntryType.FIRST_INPUT,
      startTime: 1 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual({
      value: 40 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
    })
  })

  it('should replace the entry in the list of worst interactions when an entry with the same interactionId exist', () => {
    for (let index = 1; index <= 100; index++) {
      newInteraction(lifeCycle, {
        duration: index as Duration,
        interactionId: 1,
        startTime: index as RelativeTime,
      })
    }
    // the p98 return 100 which shows that the entry has been updated
    expect(getInteractionToNextPaint()).toEqual({
      value: 100 as Duration,
      targetSelector: undefined,
      time: 100 as RelativeTime,
    })
  })

  it('should get the time from the beginning of the view', () => {
    // stop the current tracking from beforeEach
    cleanup()
    viewStart = 100 as RelativeTime
    startINPTracking()

    const interactionStart = 110 as RelativeTime
    newInteraction(lifeCycle, {
      interactionId: 1,
      duration: 10 as Duration,
      startTime: interactionStart,
    })
    expect(getInteractionToNextPaint()!.time).toEqual(elapsed(viewStart, interactionStart))
  })

  describe('target selector', () => {
    it('should be returned', () => {
      newInteraction(lifeCycle, {
        interactionId: 2,
        target: appendElement('<button id="inp-target-element"></button>'),
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual('#inp-target-element')
    })

    it("should not be returned if it's not a DOM element", () => {
      newInteraction(lifeCycle, {
        interactionId: 2,
        target: appendText('text'),
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual(undefined)
    })

    it('should not be recomputed if the INP has not changed', () => {
      const element = appendElement('<button id="foo"></button>')
      newInteraction(lifeCycle, {
        interactionId: 1,
        duration: 10 as Duration,
        target: element,
      })

      element.setAttribute('id', 'bar')

      newInteraction(lifeCycle, {
        interactionId: 2,
        duration: 9 as Duration,
        target: element,
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual('#foo')
    })

    it('should be recomputed if the INP has changed', () => {
      newInteraction(lifeCycle, {
        interactionId: 1,
        duration: 10 as Duration,
        target: appendElement('<button id="foo"></button>'),
      })

      newInteraction(lifeCycle, {
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
