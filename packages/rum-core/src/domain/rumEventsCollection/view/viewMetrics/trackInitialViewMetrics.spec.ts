import type { Duration } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../../test'
import { noopWebVitalTelemetryDebug, setup } from '../../../../../test'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumConfiguration } from '../../../configuration'
import { FAKE_FIRST_INPUT_ENTRY, FAKE_NAVIGATION_ENTRY, FAKE_PAINT_ENTRY } from '../setupViewTest.specHelper'
import { KEEP_TRACKING_METRICS_AFTER_VIEW_DELAY, trackInitialViewMetrics } from './trackInitialViewMetrics'

describe('trackInitialViewMetrics', () => {
  let setupBuilder: TestSetupBuilder
  let scheduleViewUpdateSpy: jasmine.Spy<() => void>
  let trackInitialViewMetricsResult: ReturnType<typeof trackInitialViewMetrics>
  let setLoadEventSpy: jasmine.Spy<(loadEvent: Duration) => void>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    scheduleViewUpdateSpy = jasmine.createSpy()
    setLoadEventSpy = jasmine.createSpy()

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      trackInitialViewMetricsResult = trackInitialViewMetrics(
        lifeCycle,
        configuration,
        noopWebVitalTelemetryDebug,
        setLoadEventSpy,
        scheduleViewUpdateSpy
      )
      return trackInitialViewMetricsResult
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should merge metrics from various sources', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      FAKE_NAVIGATION_ENTRY,
      FAKE_PAINT_ENTRY,
      FAKE_FIRST_INPUT_ENTRY,
    ])

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(3)
    expect(trackInitialViewMetricsResult.initialViewMetrics).toEqual({
      firstByte: 123 as Duration,
      domComplete: 456 as Duration,
      domContentLoaded: 345 as Duration,
      domInteractive: 234 as Duration,
      firstContentfulPaint: 123 as Duration,
      firstInputDelay: 100 as Duration,
      firstInputTime: 1000 as Duration,
      loadEvent: 567 as Duration,
    })
  })

  it('allows delaying the stop logic', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    trackInitialViewMetricsResult.scheduleStop()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(1)

    clock.tick(KEEP_TRACKING_METRICS_AFTER_VIEW_DELAY)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_PAINT_ENTRY])

    expect(scheduleViewUpdateSpy).toHaveBeenCalledTimes(1)
  })

  it('calls the `setLoadEvent` callback when the loadEvent timing is known', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      FAKE_NAVIGATION_ENTRY,
      FAKE_PAINT_ENTRY,
      FAKE_FIRST_INPUT_ENTRY,
    ])

    expect(setLoadEventSpy).toHaveBeenCalledOnceWith(567 as Duration)
  })
})
