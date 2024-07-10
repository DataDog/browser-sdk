import type { RelativeTime } from '@datadog/browser-core'
import { setPageVisibility } from '@datadog/browser-core/test'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { TestSetupBuilder } from '../../../../test'
import { createPerformanceEntry, setup } from '../../../../test'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { FCP_MAXIMUM_DELAY, trackFirstContentfulPaint } from './trackFirstContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackFirstContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let fcpCallback: jasmine.Spy<(value: RelativeTime) => void>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fcpCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      const firstHidden = trackFirstHidden(configuration)
      const firstContentfulPaint = trackFirstContentfulPaint(lifeCycle, firstHidden, fcpCallback)
      return {
        stop() {
          firstHidden.stop()
          firstContentfulPaint.stop()
        },
      }
    })
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(fcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(fcpCallback).toHaveBeenCalledWith(123 as RelativeTime)
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.PAINT, { startTime: FCP_MAXIMUM_DELAY as RelativeTime }),
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })
})
