import { type Duration, type RelativeTime } from '@datadog/browser-core'
import { registerCleanupTask, restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import { appendElement, appendText, createPerformanceEntry } from '../../../../test'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { FirstInput } from './trackFirstInput'
import { trackFirstInput } from './trackFirstInput'
import { trackFirstHidden } from './trackFirstHidden'

describe('firstInputTimings', () => {
  const lifeCycle = new LifeCycle()
  let fitCallback: jasmine.Spy<(firstInput: FirstInput) => void>
  let configuration: RumConfiguration

  function startFirstInputTracking() {
    configuration = {} as RumConfiguration
    fitCallback = jasmine.createSpy()

    const firstHidden = trackFirstHidden(configuration)
    const firstInputTimings = trackFirstInput(lifeCycle, configuration, firstHidden, fitCallback)

    registerCleanupTask(() => {
      firstHidden.stop()
      firstInputTimings.stop()
      restorePageVisibility()
    })
  }

  it('should provide the first input timings', () => {
    startFirstInputTracking()
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
    startFirstInputTracking()
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
    startFirstInputTracking()
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
    startFirstInputTracking()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])

    expect(fitCallback).not.toHaveBeenCalled()
  })

  it('should be adjusted to 0 if the computed value would be negative due to browser timings imprecisions', () => {
    startFirstInputTracking()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        processingStart: 900 as RelativeTime,
        startTime: 1000 as RelativeTime,
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
