import { noop, Observable } from '@datadog/browser-core'
import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { registerCleanupTask, SPEC_ENDPOINTS } from '@datadog/browser-core/test'
import type { RecorderApi } from '../../boot/rumPublicApi'
import { collectAndValidateRawRumEvents, mockPageStateHistory, noopRecorderApi } from '../../../test'
import type { RawRumEvent, RawRumViewEvent } from '../../rawRumEvent.types'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { PageState } from '../contexts/pageStateHistory'
import { validateAndBuildRumConfiguration, type RumConfiguration } from '../configuration'
import type { FeatureFlagContexts } from '../contexts/featureFlagContext'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { ViewEvent } from './trackViews'
import { startViewCollection } from './viewCollection'

const VIEW: ViewEvent = {
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
    actionCount: 10,
    frustrationCount: 10,
  },
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: undefined,
  isActive: false,
  loadingType: ViewLoadingType.INITIAL_LOAD,
  location: {} as Location,
  startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
  initialViewMetrics: {
    navigationTimings: {
      firstByte: 10 as Duration,
      domComplete: 10 as Duration,
      domContentLoaded: 10 as Duration,
      domInteractive: 10 as Duration,
      loadEvent: 10 as Duration,
    },
    firstInput: {
      delay: 12 as Duration,
      time: 10 as RelativeTime,
    },
    firstContentfulPaint: 10 as Duration,
    largestContentfulPaint: { value: 10 as RelativeTime },
  },
  commonViewMetrics: {
    loadingTime: 20 as Duration,
    cumulativeLayoutShift: { value: 1, time: 100 as Duration },
    interactionToNextPaint: { value: 10 as Duration, time: 100 as Duration },
    scroll: {
      maxDepth: 2000,
      maxScrollHeight: 3000,
      maxScrollHeightTime: 4000000000 as Duration,
      maxDepthScrollTop: 1000,
    },
  },
  sessionIsActive: true,
}

const baseFeatureFlagContexts: FeatureFlagContexts = {
  findFeatureFlagEvaluations: () => undefined,
  addFeatureFlagEvaluation: noop,
  stop: noop,
}
const baseConfiguration: RumConfiguration = {
  ...validateAndBuildRumConfiguration({
    clientToken: 'xxx',
    applicationId: 'FAKE_APP_ID',
    trackResources: true,
    trackLongTasks: true,
  })!,
  ...SPEC_ENDPOINTS,
}
const pageStateHistory = mockPageStateHistory({
  findAll: () => [
    { start: 0 as ServerDuration, state: PageState.ACTIVE },
    { start: 10 as ServerDuration, state: PageState.PASSIVE },
  ]})

describe('viewCollection', () => {
  const lifeCycle = new LifeCycle()
  let configuration: RumConfiguration
  let featureFlagContexts: FeatureFlagContexts
  let getReplayStatsSpy: jasmine.Spy<RecorderApi['getReplayStats']>
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []

  function setupViewCollection() {
    const domMutationObservable = new Observable<void>()
    const locationChangeObservable = new Observable<LocationChange>()

    const collectionResult = startViewCollection(
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

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
      collectionResult.stop()
      rawRumEvents = []
    })
  }

  beforeEach(() => {
    getReplayStatsSpy = jasmine.createSpy()
    configuration = baseConfiguration
    featureFlagContexts = baseFeatureFlagContexts
  })

  it('should create view from view update', () => {
    setupViewCollection()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      _dd: {
        document_version: 3,
        replay_stats: undefined,
        page_states: [
          { start: 0 as ServerDuration, state: PageState.ACTIVE },
          { start: 10 as ServerDuration, state: PageState.PASSIVE },
        ],
        configuration: {
          start_session_replay_recording_manually: jasmine.any(Boolean),
        },
      },
      date: jasmine.any(Number),
      type: RumEventType.VIEW,
      view: {
        action: {
          count: 10,
        },
        frustration: {
          count: 10,
        },
        cumulative_layout_shift: 1,
        cumulative_layout_shift_target_selector: undefined,
        cumulative_layout_shift_time: (100 * 1e6) as ServerDuration,
        custom_timings: {
          bar: (20 * 1e6) as ServerDuration,
          foo: (10 * 1e6) as ServerDuration,
        },
        first_byte: (10 * 1e6) as ServerDuration,
        dom_complete: (10 * 1e6) as ServerDuration,
        dom_content_loaded: (10 * 1e6) as ServerDuration,
        dom_interactive: (10 * 1e6) as ServerDuration,
        error: {
          count: 10,
        },
        first_contentful_paint: (10 * 1e6) as ServerDuration,
        first_input_delay: (12 * 1e6) as ServerDuration,
        first_input_time: (10 * 1e6) as ServerDuration,
        first_input_target_selector: undefined,
        interaction_to_next_paint: (10 * 1e6) as ServerDuration,
        interaction_to_next_paint_target_selector: undefined,
        interaction_to_next_paint_time: (100 * 1e6) as ServerDuration,
        is_active: false,
        name: undefined,
        largest_contentful_paint: (10 * 1e6) as ServerDuration,
        largest_contentful_paint_target_selector: undefined,
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
      },
      session: {
        has_replay: undefined,
        is_active: undefined,
      },
      feature_flags: undefined,
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
    setupViewCollection()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...VIEW, sessionIsActive: false })

    expect((rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent).session.is_active).toBe(false)
  })

  it('should include replay information if available', () => {
    setupViewCollection()
    getReplayStatsSpy.and.returnValue({ segments_count: 4, records_count: 10, segments_total_raw_size: 1000 })

    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

    expect(getReplayStatsSpy).toHaveBeenCalledWith(VIEW.id)
    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234 as RelativeTime)
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
    expect(rawRumViewEvent._dd.replay_stats).toEqual({
      segments_count: 4,
      records_count: 10,
      segments_total_raw_size: 1000,
    })
    expect(rawRumViewEvent.session.has_replay).toBe(true)
  })

  it('should include feature flags', () => {
    featureFlagContexts = { ...baseFeatureFlagContexts, findFeatureFlagEvaluations: () => ({ feature: 'foo' }) }
    setupViewCollection()

    const view: ViewEvent = { ...VIEW, commonViewMetrics: { loadingTime: -20 as Duration } }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view)
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

    expect(rawRumViewEvent.feature_flags).toEqual({ feature: 'foo' })
  })

  it('should discard negative loading time', () => {
    setupViewCollection()
    const view: ViewEvent = { ...VIEW, commonViewMetrics: { loadingTime: -20 as Duration } }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view)
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

    expect(rawRumViewEvent.view.loading_time).toBeUndefined()
  })

  it('should not include scroll metrics when there are not scroll metrics in the raw event', () => {
    setupViewCollection()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...VIEW, commonViewMetrics: { scroll: undefined } })
    const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

    expect(rawRumViewEvent.display?.scroll).toBeUndefined()
  })

  describe('with configuration.start_session_replay_recording_manually set', () => {
    it('should include startSessionReplayRecordingManually false', () => {
      // when configured to false
      configuration = { ...baseConfiguration, startSessionReplayRecordingManually: false }
      setupViewCollection()
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

      expect(
        (rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent)._dd.configuration
          .start_session_replay_recording_manually
      ).toBe(false)
    })

    it('should include startSessionReplayRecordingManually true', () => {
      // when configured to true
      configuration = { ...baseConfiguration, startSessionReplayRecordingManually: true }
      setupViewCollection()
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

      expect(
        (rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent)._dd.configuration
          .start_session_replay_recording_manually
      ).toBe(true)
    })
  })
})
