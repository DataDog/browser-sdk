import type { Duration } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import { LifeCycleEventType } from '../../../lifeCycle'
import { FAKE_NAVIGATION_ENTRY } from '../setupViewTest.specHelper'
import type { InitialViewMetrics } from './trackInitialViewMetrics'
import { trackNavigationTimings } from './trackNavigationTimings'

describe('trackNavigationTimings', () => {
  let setupBuilder: TestSetupBuilder
  let navigationTimingsCallback: jasmine.Spy<(value: Partial<InitialViewMetrics>) => void>

  beforeEach(() => {
    navigationTimingsCallback = jasmine.createSpy()

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackNavigationTimings(lifeCycle, navigationTimingsCallback))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should provide navigation timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])

    expect(navigationTimingsCallback).toHaveBeenCalledTimes(1)
    expect(navigationTimingsCallback).toHaveBeenCalledWith({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      loadEvent: 567 as Duration,
    })
  })
})
