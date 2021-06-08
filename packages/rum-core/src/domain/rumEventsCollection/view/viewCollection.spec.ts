import { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType, ViewLoadingType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { ViewEvent } from './trackViews'
import { startViewCollection } from './viewCollection'

describe('viewCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .withForegroundContexts({
        getInForegroundPeriods: () => [{ start: 0 as ServerDuration, duration: 10 as ServerDuration }],
      })
      .beforeBuild(({ lifeCycle, configuration, foregroundContexts, domMutationObservable }) => {
        startViewCollection(lifeCycle, configuration, location, domMutationObservable, foregroundContexts)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create view from view update', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const location: Partial<Location> = {}
    const view: ViewEvent = {
      cumulativeLayoutShift: 1,
      customTimings: {
        bar: 20 as Duration,
        foo: 10 as Duration,
      },
      documentVersion: 3,
      duration: 100 as Duration,
      eventCounts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
        userActionCount: 10,
      },
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: undefined,
      isActive: false,
      hasReplay: false,
      loadingTime: 20 as Duration,
      loadingType: ViewLoadingType.INITIAL_LOAD,
      location: location as Location,
      referrer: '',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      timings: {
        domComplete: 10 as Duration,
        domContentLoaded: 10 as Duration,
        domInteractive: 10 as Duration,
        firstContentfulPaint: 10 as Duration,
        firstInputDelay: 12 as Duration,
        firstInputTime: 10 as Duration,
        largestContentfulPaint: 10 as Duration,
        loadEvent: 10 as Duration,
      },
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view)

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      _dd: {
        document_version: 3,
      },
      date: jasmine.any(Number),
      type: RumEventType.VIEW,
      view: {
        action: {
          count: 10,
        },
        cumulative_layout_shift: 1,
        custom_timings: {
          bar: (20 * 1e6) as ServerDuration,
          foo: (10 * 1e6) as ServerDuration,
        },
        dom_complete: (10 * 1e6) as ServerDuration,
        dom_content_loaded: (10 * 1e6) as ServerDuration,
        dom_interactive: (10 * 1e6) as ServerDuration,
        error: {
          count: 10,
        },
        first_contentful_paint: (10 * 1e6) as ServerDuration,
        first_input_delay: (12 * 1e6) as ServerDuration,
        first_input_time: (10 * 1e6) as ServerDuration,
        is_active: false,
        name: undefined,
        largest_contentful_paint: (10 * 1e6) as ServerDuration,
        load_event: (10 * 1e6) as ServerDuration,
        loading_time: (20 * 1e6) as ServerDuration,
        loading_type: ViewLoadingType.INITIAL_LOAD,
        long_task: {
          count: 10,
        },
        resource: {
          count: 10,
        },
        time_spent: (100 * 1e6) as ServerDuration,
        in_foreground_periods: [{ start: 0 as ServerDuration, duration: 10 as ServerDuration }],
      },
      session: {
        has_replay: undefined,
      },
    })
  })
})
