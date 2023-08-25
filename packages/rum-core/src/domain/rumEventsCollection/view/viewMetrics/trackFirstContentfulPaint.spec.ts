import type { RelativeTime } from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import type { RumPerformancePaintTiming } from 'packages/rum-core/src/browser/performanceCollection'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumConfiguration } from '../../../configuration'
import { resetFirstHidden } from './trackFirstHidden'
import { FCP_MAXIMUM_DELAY, trackFirstContentfulPaint } from './trackFirstContentfulPaint'

const FAKE_PAINT_ENTRY: RumPerformancePaintTiming = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123 as RelativeTime,
}

describe('trackFirstContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let fcpCallback: jasmine.Spy<(value: RelativeTime) => void>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fcpCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) =>
      trackFirstContentfulPaint(lifeCycle, configuration, fcpCallback)
    )
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the first contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_PAINT_ENTRY])

    expect(fcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(fcpCallback).toHaveBeenCalledWith(123 as RelativeTime)
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_PAINT_ENTRY])
    expect(fcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        ...FAKE_PAINT_ENTRY,
        startTime: FCP_MAXIMUM_DELAY as RelativeTime,
      },
    ])
    expect(fcpCallback).not.toHaveBeenCalled()
  })
})
