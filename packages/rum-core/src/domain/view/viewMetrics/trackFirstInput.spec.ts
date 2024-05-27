import { type Duration, type RelativeTime, resetExperimentalFeatures } from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../test'
import { appendElement, appendText, createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { FirstInput } from './trackFirstInput'
import { trackFirstInput } from './trackFirstInput'
import { trackFirstHidden } from './trackFirstHidden'

describe('firstInputTimings', () => {
  let setupBuilder: TestSetupBuilder
  let fitCallback: jasmine.Spy<(firstInput: FirstInput) => void>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fitCallback = jasmine.createSpy()

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      const firstHidden = trackFirstHidden(configuration)
      const firstInputTimings = trackFirstInput(lifeCycle, configuration, firstHidden, fitCallback)

      return {
        stop() {
          firstHidden.stop()
          firstInputTimings.stop()
        },
      }
    })
  })

  afterEach(() => {
    restorePageVisibility()
    resetExperimentalFeatures()
  })

  it('should provide the first input timings', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])

    expect(fitCallback).toHaveBeenCalledOnceWith({
      delay: 100 as Duration,
      time: 1000 as RelativeTime,
      targetSelector: undefined,
    })
  })

  it('should provide the first input target selector', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        target: appendElement('<button id="fid-target-element"></button>'),
      }),
    ])

    expect(fitCallback).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        targetSelector: '#fid-target-element',
      })
    )
  })

  it("should not provide the first input target if it's not a DOM element", () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        target: appendText('text'),
      }),
    ])

    expect(fitCallback).toHaveBeenCalledWith(
      jasmine.objectContaining({
        targetSelector: undefined,
      })
    )
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])

    expect(fitCallback).not.toHaveBeenCalled()
  })

  it('should be adjusted to 0 if the computed value would be negative due to browser timings imprecisions', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        startTime: 1000 as RelativeTime,
        processingStart: 900 as RelativeTime,
        duration: 0 as Duration,
      }),
    ])

    expect(fitCallback).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        delay: 0,
        time: 1000,
      })
    )
  })
})
