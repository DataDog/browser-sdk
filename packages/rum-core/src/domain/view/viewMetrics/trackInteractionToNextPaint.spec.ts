import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, relativeNow, ExperimentalFeature, addExperimentalFeatures } from '@datadog/browser-core'
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
import { getInteractionSelector, updateInteractionSelector } from '../../action/interactionSelectorCache'
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
      interactionToNextPaintTracking.stop()
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
      interactionId: 1,
      duration: 10 as Duration,
      startTime: -1 as RelativeTime,
    })
    newInteraction({
      interactionId: 2,
      duration: 10 as Duration,
      startTime: 11 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual(undefined)
  })

  it('should take into account entries that starts in view time bounds but finish after view end', () => {
    startINPTracking()
    setViewEnd(10 as RelativeTime)

    newInteraction({
      interactionId: 1,
      duration: 100 as Duration,
      startTime: 1 as RelativeTime,
    })
    expect(getInteractionToNextPaint()).toEqual({
      value: 100 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      subParts: undefined,
    })
  })

  it('should cap INP value', () => {
    startINPTracking()
    newInteraction({
      interactionId: 1,
      duration: (MAX_INP_VALUE + 1) as Duration,
      startTime: 1 as RelativeTime,
    })

    expect(getInteractionToNextPaint()).toEqual({
      value: MAX_INP_VALUE,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      subParts: undefined,
    })
  })

  it('should return the p98 worst interaction', () => {
    startINPTracking()
    for (let index = 1; index <= 100; index++) {
      newInteraction({
        duration: index as Duration,
        interactionId: index,
        startTime: index as RelativeTime,
      })
    }
    expect(getInteractionToNextPaint()).toEqual({
      value: 98 as Duration,
      targetSelector: undefined,
      time: 98 as RelativeTime,
      subParts: undefined,
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
      duration: 40 as Duration,
    })
    expect(getInteractionToNextPaint()).toEqual({
      value: 40 as Duration,
      targetSelector: undefined,
      time: 1 as RelativeTime,
      subParts: undefined,
    })
  })

  it('should replace the entry in the list of worst interactions when an entry with the same interactionId exist', () => {
    startINPTracking()
    for (let index = 1; index <= 100; index++) {
      newInteraction({
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
      subParts: undefined,
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

    it('should check interactionSelectorCache for entries', () => {
      startINPTracking()
      const startTime = relativeNow()
      updateInteractionSelector(startTime, '#foo')

      newInteraction({
        interactionId: 1,
        duration: 1 as Duration,
        startTime,
        target: undefined,
      })

      expect(getInteractionToNextPaint()?.targetSelector).toEqual('#foo')
      expect(getInteractionSelector(startTime)).toBeUndefined()
    })
  })

  describe('INP subparts', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.INP_SUBPARTS])
    })

    it('should not include subparts when INP is 0', () => {
      startINPTracking()
      interactionCountMock.setInteractionCount(1 as Duration)

      expect(getInteractionToNextPaint()).toEqual({ value: 0 as Duration })
    })
    ;[
      {
        description: 'should calculate INP subparts correctly',
        interaction: {
          startTime: 1000,
          processingStart: 1050,
          processingEnd: 1200,
          duration: 250,
        },
        expectedSubParts: {
          inputDelay: 50, // 1050 - 1000
          processingDuration: 150, // 1200 - 1050
          presentationDelay: 50, // 1250 - 1200
        },
      },
      {
        description: 'should return undefined subparts when processingStart is missing',
        interaction: {
          startTime: 1000,
          processingStart: undefined,
          processingEnd: 1200,
          duration: 250,
        },
        expectedSubParts: undefined,
      },
      {
        description: 'should return undefined subparts when processingEnd is missing',
        interaction: {
          startTime: 1000,
          processingStart: 1050,
          processingEnd: undefined,
          duration: 250,
        },
        expectedSubParts: undefined,
      },
      {
        description: 'should clamp processingEnd to nextPaintTime',
        interaction: {
          startTime: 1000,
          processingStart: 1050,
          processingEnd: 1300, // Exceeds nextPaintTime (1000 + 250 = 1250)
          duration: 250,
        },
        expectedSubParts: {
          inputDelay: 50, // 1050 - 1000
          processingDuration: 200, // 1250 - 1050 (clamped)
          presentationDelay: 0, // 1250 - 1250
        },
      },
    ].forEach(({ description, interaction, expectedSubParts }) => {
      it(description, () => {
        startINPTracking()

        newInteraction({
          interactionId: 1,
          startTime: interaction.startTime as RelativeTime,
          processingStart: interaction.processingStart as RelativeTime | undefined,
          processingEnd: interaction.processingEnd as RelativeTime | undefined,
          duration: interaction.duration as Duration,
        })

        const inp = getInteractionToNextPaint()

        if (expectedSubParts === undefined) {
          expect(inp?.subParts).toBeUndefined()
        } else {
          expect(inp?.subParts).toEqual({
            inputDelay: expectedSubParts.inputDelay as Duration,
            processingDuration: expectedSubParts.processingDuration as Duration,
            presentationDelay: expectedSubParts.presentationDelay as Duration,
          })
          // Validate: subparts sum equals INP duration
          const subPartsSum =
            expectedSubParts.inputDelay + expectedSubParts.processingDuration + expectedSubParts.presentationDelay
          expect(subPartsSum).toBe(interaction.duration)
        }
      })
    })

    it('should handle entry grouping with same interactionId by using group max processingEnd', () => {
      startINPTracking()

      newInteraction({
        interactionId: 1,
        startTime: 1000 as RelativeTime,
        processingStart: 1050 as RelativeTime,
        processingEnd: 1100 as RelativeTime,
        duration: 250 as Duration,
      })

      newInteraction({
        interactionId: 1,
        startTime: 1005 as RelativeTime,
        processingStart: 1060 as RelativeTime,
        processingEnd: 1200 as RelativeTime,
        duration: 245 as Duration,
      })

      const inp = getInteractionToNextPaint()
      expect(inp?.value).toBe(250 as Duration)
      expect(inp?.subParts).toEqual({
        inputDelay: 50 as Duration,
        processingDuration: 150 as Duration,
        presentationDelay: 50 as Duration,
      })
    })

    it('should group entries within 8ms renderTime window', () => {
      startINPTracking()

      newInteraction({
        interactionId: 1,
        startTime: 1000 as RelativeTime,
        processingStart: 1050 as RelativeTime,
        processingEnd: 1150 as RelativeTime,
        duration: 250 as Duration,
      })

      // within 8ms renderTime window
      newInteraction({
        interactionId: 2,
        startTime: 1010 as RelativeTime,
        processingStart: 1055 as RelativeTime,
        processingEnd: 1240 as RelativeTime,
        duration: 245 as Duration,
      })

      // outside of 8ms renderTime window
      newInteraction({
        interactionId: 2,
        startTime: 1020 as RelativeTime,
        processingStart: 1070 as RelativeTime,
        processingEnd: 1200 as RelativeTime,
        duration: 190 as Duration,
      })

      const inp = getInteractionToNextPaint()
      expect(inp?.value).toBe(250 as Duration)
      expect(inp?.subParts).toEqual({
        inputDelay: 50 as Duration,
        processingDuration: 190 as Duration,
        presentationDelay: 10 as Duration,
      })
    })

    it('should keep correct subparts for p98 after interactions causing pruning', () => {
      startINPTracking()

      // The interaction that will remain the p98 throughout
      newInteraction({
        interactionId: 1,
        startTime: 1000 as RelativeTime,
        processingStart: 1050 as RelativeTime,
        processingEnd: 1200 as RelativeTime,
        duration: 1100 as Duration,
      })

      // Add more than MAX_INTERACTION_ENTRIES (10) shorter interactions to fill longestInteractions
      // and trigger eviction and pruning of their groups
      for (let i = 2; i <= 12; i++) {
        newInteraction({
          interactionId: i,
          startTime: (i * 2000) as RelativeTime,
          processingStart: (i * 2000 + 10) as RelativeTime,
          processingEnd: (i * 2000 + 20) as RelativeTime,
          duration: i as Duration,
        })
      }

      const inp = getInteractionToNextPaint()
      expect(inp?.value).toBe(1100 as Duration)
      expect(inp?.subParts).toEqual({
        inputDelay: 50 as Duration,
        processingDuration: 150 as Duration,
        presentationDelay: 900 as Duration,
      })
    })

    it('should update subparts when INP changes to a different interaction', () => {
      startINPTracking()

      newInteraction({
        interactionId: 1,
        startTime: 1000 as RelativeTime,
        processingStart: 1050 as RelativeTime,
        processingEnd: 1150 as RelativeTime,
        duration: 200 as Duration,
      })

      let inp = getInteractionToNextPaint()
      expect(inp?.subParts?.inputDelay).toBe(50 as Duration)

      newInteraction({
        interactionId: 2,
        startTime: 2000 as RelativeTime,
        processingStart: 2100 as RelativeTime,
        processingEnd: 2350 as RelativeTime,
        duration: 400 as Duration,
      })

      inp = getInteractionToNextPaint()
      expect(inp?.value).toBe(400 as Duration)
      expect(inp?.subParts).toEqual({
        inputDelay: 100 as Duration,
        processingDuration: 250 as Duration,
        presentationDelay: 50 as Duration,
      })
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
