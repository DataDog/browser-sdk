import type { Duration } from '@datadog/browser-core'
import {
  ExperimentalFeature,
  addExperimentalFeatures,
  relativeNow,
  resetExperimentalFeatures,
} from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../test'
import { setup } from '../../../../test'
import type {
  BrowserWindow,
  RumFirstInputTiming,
  RumPerformanceEventTiming,
} from '../../../browser/performanceCollection'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import {
  trackInteractionToNextPaint,
  trackViewInteractionCount,
  isInteractionToNextPaintSupported,
} from './trackInteractionToNextPaint'

describe('trackInteractionToNextPaint', () => {
  let setupBuilder: TestSetupBuilder
  let interactionCountStub: ReturnType<typeof subInteractionCount>
  let getInteractionToNextPaint: () => Duration | undefined

  function newInteraction(
    lifeCycle: LifeCycle,
    {
      interactionId,
      duration = 40 as Duration,
      entryType = 'event',
    }: Partial<RumPerformanceEventTiming | RumFirstInputTiming>
  ) {
    if (interactionId) {
      interactionCountStub.incrementInteractionCount()
    }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        entryType,
        processingStart: relativeNow(),
        startTime: relativeNow(),
        duration,
        interactionId,
      },
    ])
  }

  beforeEach(() => {
    if (!isInteractionToNextPaintSupported()) {
      pending('No INP support')
    }

    interactionCountStub = subInteractionCount()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      ;({ getInteractionToNextPaint } = trackInteractionToNextPaint(ViewLoadingType.INITIAL_LOAD, lifeCycle))
    })
  })

  afterEach(() => {
    interactionCountStub.clear()
  })

  describe('if feature flag enabled', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.INTERACTION_TO_NEXT_PAINT])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should return undefined when there are no interactions', () => {
      setupBuilder.build()
      expect(getInteractionToNextPaint()).toEqual(undefined)
    })

    it('should ignore entries without interactionId', () => {
      const { lifeCycle } = setupBuilder.build()
      newInteraction(lifeCycle, {
        interactionId: undefined,
      })
      expect(getInteractionToNextPaint()).toEqual(undefined)
    })

    it('should return the p98 worst interaction', () => {
      const { lifeCycle } = setupBuilder.build()
      for (let index = 1; index <= 100; index++) {
        newInteraction(lifeCycle, {
          duration: index as Duration,
          interactionId: index,
        })
      }
      expect(getInteractionToNextPaint()).toEqual(98 as Duration)
    })

    it('should return 0 when an interaction happened without generating a performance event (interaction duration below 40ms)', () => {
      setupBuilder.build()
      interactionCountStub.setInteractionCount(1 as Duration) // assumes an interaction happened but no PERFORMANCE_ENTRIES_COLLECTED have been triggered
      expect(getInteractionToNextPaint()).toEqual(0 as Duration)
    })

    it('should take first-input entry into account', () => {
      const { lifeCycle } = setupBuilder.build()
      newInteraction(lifeCycle, {
        interactionId: 1,
        entryType: 'first-input',
      })
      expect(getInteractionToNextPaint()).toEqual(40 as Duration)
    })

    it('should replace the entry in the list of worst interactions when an entry with the same interactionId exist', () => {
      const { lifeCycle } = setupBuilder.build()

      for (let index = 1; index <= 100; index++) {
        newInteraction(lifeCycle, {
          duration: index as Duration,
          interactionId: 1,
        })
      }
      // the p98 return 100 which shows that the entry has been updated
      expect(getInteractionToNextPaint()).toEqual(100 as Duration)
    })
  })

  describe('if feature flag disabled', () => {
    it('should return undefined', () => {
      const { lifeCycle } = setupBuilder.build()
      newInteraction(lifeCycle, {
        interactionId: 1,
      })
      expect(getInteractionToNextPaint()).toEqual(undefined)
    })
  })
})

describe('trackViewInteractionCount', () => {
  let interactionCountStub: ReturnType<typeof subInteractionCount>

  beforeEach(() => {
    interactionCountStub = subInteractionCount()
    interactionCountStub.setInteractionCount(5 as Duration)
  })
  afterEach(() => {
    interactionCountStub.clear()
  })

  it('should count the interaction happening since the time origin when view loading type is initial_load', () => {
    const { getViewInteractionCount } = trackViewInteractionCount(ViewLoadingType.INITIAL_LOAD)

    expect(getViewInteractionCount()).toEqual(5)
  })

  it('should count the interaction from the moment the function is called when view loading type is route_change', () => {
    const { getViewInteractionCount } = trackViewInteractionCount(ViewLoadingType.ROUTE_CHANGE)

    expect(getViewInteractionCount()).toEqual(0)
  })
})

function subInteractionCount() {
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
