import {
  noop,
  type Duration,
  type RelativeTime,
  resetExperimentalFeatures,
  ExperimentalFeature,
  addExperimentalFeatures,
} from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../test'
import { appendElement, createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import { trackFirstInputTimings } from './trackFirstInputTimings'
import { trackFirstHidden } from './trackFirstHidden'

describe('firstInputTimings', () => {
  let setupBuilder: TestSetupBuilder
  let fitCallback: jasmine.Spy<
    ({
      firstInputDelay,
      firstInputTime,
      firstInputTargetSelector,
    }: {
      firstInputDelay: number
      firstInputTime: number
      firstInputTargetSelector?: string
    }) => void
  >
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fitCallback = jasmine.createSpy()

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      const firstHidden = trackFirstHidden(configuration)
      const firstInputTimings = trackFirstInputTimings(
        lifeCycle,
        configuration,
        { addWebVitalTelemetryDebug: noop },
        firstHidden,
        fitCallback
      )

      return {
        stop() {
          firstHidden.stop()
          firstInputTimings.stop()
        },
      }
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetExperimentalFeatures()
  })

  it('should provide the first input timings', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT),
    ])

    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith({
      firstInputDelay: 100,
      firstInputTime: 1000,
      firstInputTargetSelector: undefined,
    })
  })

  it('should provide the first input target selector if FF enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.WEB_VITALS_ATTRIBUTION])
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.FIRST_INPUT, {
        target: appendElement('button', { id: 'fid-target-element' }),
      }),
    ])

    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith(
      jasmine.objectContaining({
        firstInputTargetSelector: '#fid-target-element',
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
        processingStart: 900 as RelativeTime,
        startTime: 1000 as RelativeTime,
        duration: 0 as Duration,
      }),
    ])

    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith(
      jasmine.objectContaining({
        firstInputDelay: 0,
        firstInputTime: 1000,
      })
    )
  })
})
