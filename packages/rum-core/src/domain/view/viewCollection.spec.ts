import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { resetExperimentalFeatures } from '@datadog/browser-core'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { TestSetupBuilder } from '../../../test'
import { setup, noopRecorderApi } from '../../../test'
import type { RawRumViewEvent } from '../../rawRumEvent.types'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { PageState } from '../contexts/pageStateHistory'
import type { ViewEvent } from './trackViews'
import { startViewCollection } from './viewCollection'

const VIEW: ViewEvent = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: undefined,
  location: {} as Location,
  commonViewMetrics: {
    loadingTime: 20 as Duration,
    cumulativeLayoutShift: { value: 1 },
    interactionToNextPaint: { value: 10 as Duration },
    scroll: {
      maxDepth: 2000,
      maxScrollHeight: 3000,
      maxDepthScrollTop: 1000,
      maxScrollHeightTime: 4000000000 as Duration,
    },
  },
  initialViewMetrics: {
    firstContentfulPaint: 10 as Duration,
    navigationTimings: {
      domComplete: 10 as Duration,
      domContentLoaded: 10 as Duration,
      domInteractive: 10 as Duration,
      loadEvent: 10 as Duration,
      firstByte: 10 as Duration,
    },
    largestContentfulPaint: { value: 10 as RelativeTime },
    firstInput: {
      delay: 12 as Duration,
      time: 10 as RelativeTime,
    },
  },
  customTimings: {
    bar: 20 as Duration,
    foo: 10 as Duration,
  },
  eventCounts: {
    errorCount: 10,
    actionCount: 10,
    longTaskCount: 10,
    resourceCount: 10,
    frustrationCount: 10,
  },
  documentVersion: 3,
  startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
  duration: 100 as Duration,
  isActive: false,
  sessionIsActive: true,
  loadingType: ViewLoadingType.INITIAL_LOAD,
}

describe('viewCollection', () => {
  let setupBuilder: TestSetupBuilder
  let getReplayStatsSpy: jasmine.Spy<RecorderApi['getReplayStats']>

  beforeEach(() => {
    setupBuilder = setup()
      .withPageStateHistory({
        findAll: () => [
          { state: PageState.ACTIVE, start: 0 as ServerDuration },
          { state: PageState.PASSIVE, start: 10 as ServerDuration },
        ],
      })
      .beforeBuild(
        ({
          lifeCycle,
          configuration,
          featureFlagContexts,
          domMutationObservable,
          locationChangeObservable,
          pageStateHistory,
        }) => {
          getReplayStatsSpy = jasmine.createSpy()
          return startViewCollection(
            lifeCycle,
            configuration,
            location,
            domMutationObservable,
            locationChangeObservable,
            featureFlagContexts,
            pageStateHistory,
            {
              ...noopRecorderApi,
              getReplayStats: getReplayStatsSpy,
            }
          )
        }
      )
  })

  afterEach(() => {
    resetExperimentalFeatures()
  })

  it('should create view from view update', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      type: RumEventType.VIEW,
      view: {
        loading_type: ViewLoadingType.INITIAL_LOAD,
        first_byte: (10 * 1e6) as ServerDuration,
        first_contentful_paint: (10 * 1e6) as ServerDuration,
        first_input_delay: (12 * 1e6) as ServerDuration,
        first_input_time: (10 * 1e6) as ServerDuration,
        first_input_target_selector: undefined,
        interaction_to_next_paint: (10 * 1e6) as ServerDuration,
        interaction_to_next_paint_target_selector: undefined,
        cumulative_layout_shift: 1,
        cumulative_layout_shift_target_selector: undefined,
        custom_timings: {
          bar: (20 * 1e6) as ServerDuration,
          foo: (10 * 1e6) as ServerDuration,
        },
        largest_contentful_paint: (10 * 1e6) as ServerDuration,
        largest_contentful_paint_target_selector: undefined,
        dom_interactive: (10 * 1e6) as ServerDuration,
        dom_content_loaded: (10 * 1e6) as ServerDuration,
        dom_complete: (10 * 1e6) as ServerDuration,
        load_event: (10 * 1e6) as ServerDuration,
        loading_time: (20 * 1e6) as ServerDuration,
        time_spent: (100 * 1e6) as ServerDuration,
        is_active: false,
        name: undefined,
        error: {
          count: 10,
        },
        action: {
          count: 10,
        },
        long_task: {
          count: 10,
        },
        resource: {
          count: 10,
        },
        frustration: {
          count: 10,
        },
      },
      feature_flags: undefined,
      _dd: {
        document_version: 3,
        replay_stats: undefined,
        page_states: [
          { state: PageState.ACTIVE, start: 0 as ServerDuration },
          { state: PageState.PASSIVE, start: 10 as ServerDuration },
        ],
        configuration: {
          start_session_replay_recording_manually: jasmine.any(Boolean),
        },
      },
      session: {
        has_replay: undefined,
        is_active: undefined,
      },
      display: {
        scroll: {
          max_depth: 2000,
          max_depth_scroll_top: 1000,
          max_scroll_height: 3000,
          max_scroll_height_time: 4000000000000000 as ServerDuration,
        },
      },
      privacy: { replay_level: 'mask' },
    })
  })

  it('should set session.is_active to false if the session is inactive', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...VIEW, sessionIsActive: false })
    expect((rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent).session.is_active).toBe(false)
  })

  it('should include replay information if available', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    getReplayStatsSpy.and.returnValue({ records_count: 10, segments_count: 4, segments_total_raw_size: 1000 })

    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

    expect(getReplayStatsSpy).toHaveBeenCalledWith(VIEW.id)
    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234 as RelativeTime)
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
    expect(rawRumViewEvent._dd.replay_stats).toEqual({
      records_count: 10,
      segments_count: 4,
      segments_total_raw_size: 1000,
    })
    expect(rawRumViewEvent.session.has_replay).toBe(true)
  })

  it('should include feature flags', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder
      .withFeatureFlagContexts({ findFeatureFlagEvaluations: () => ({ feature: 'foo' }) })
      .build()

    const view: ViewEvent = { ...VIEW, commonViewMetrics: { loadingTime: -20 as Duration } }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view)
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

    expect(rawRumViewEvent.feature_flags).toEqual({ feature: 'foo' })
  })

  it('should discard negative loading time', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const view: ViewEvent = { ...VIEW, commonViewMetrics: { loadingTime: -20 as Duration } }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view)
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

    expect(rawRumViewEvent.view.loading_time).toBeUndefined()
  })

  it('should not include scroll metrics when there are not scroll metrics in the raw event', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...VIEW, commonViewMetrics: { scroll: undefined } })
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

    expect(rawRumViewEvent.display?.scroll).toBeUndefined()
  })

  it('should include configuration.start_session_replay_recording_manually value', () => {
    // when configured to false
    let { lifeCycle, rawRumEvents } = setupBuilder
      .withConfiguration({ startSessionReplayRecordingManually: false })
      .build()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)
    expect(
      (rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent)._dd.configuration
        .start_session_replay_recording_manually
    ).toBe(false)

    // when configured to true
    ;({ lifeCycle, rawRumEvents } = setupBuilder
      .withConfiguration({ startSessionReplayRecordingManually: true })
      .build())
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)
    expect(
      (rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent)._dd.configuration
        .start_session_replay_recording_manually
    ).toBe(true)
  })
})
