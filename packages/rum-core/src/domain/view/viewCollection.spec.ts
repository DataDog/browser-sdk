import { addExperimentalFeatures, DISCARDED, ExperimentalFeature, HookNames, Observable } from '@datadog/browser-core'
import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { RecorderApi } from '../../boot/rumPublicApi'
import { collectAndValidateRawRumEvents, mockRumConfiguration, mockViewHistory, noopRecorderApi } from '../../../test'
import type { RawRumEvent, RawRumViewEvent, RawRumViewUpdateEvent } from '../../rawRumEvent.types'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { ViewHistoryEntry } from '../contexts/viewHistory'
import type { AssembleHookParams, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import { startViewCollection } from './viewCollection'
import type { ViewEvent } from './trackViews'

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

describe('viewCollection', () => {
  const lifeCycle = new LifeCycle()
  let hooks: Hooks
  let getReplayStatsSpy: jasmine.Spy<RecorderApi['getReplayStats']>
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  function setupViewCollection(
    partialConfiguration: Partial<RumConfiguration> = {},
    viewHistoryEntry?: ViewHistoryEntry
  ) {
    hooks = createHooks()
    const viewHistory = mockViewHistory(viewHistoryEntry)
    getReplayStatsSpy = jasmine.createSpy()
    const domMutationObservable = new Observable<RumMutationRecord[]>()
    const windowOpenObservable = new Observable<void>()
    const locationChangeObservable = new Observable<LocationChange>()
    mockClock()

    const collectionResult = startViewCollection(
      lifeCycle,
      hooks,
      mockRumConfiguration(partialConfiguration),
      domMutationObservable,
      windowOpenObservable,
      locationChangeObservable,
      {
        ...noopRecorderApi,
        getReplayStats: getReplayStatsSpy,
      },
      viewHistory
    )

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

    registerCleanupTask(() => {
      collectionResult.stop()
      viewHistory.stop()
    })
    return collectionResult
  }

  it('should create view from view update', () => {
    setupViewCollection()
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

    expect(rawRumEvents[rawRumEvents.length - 1].startClocks.relative).toBe(1234 as RelativeTime)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      _dd: {
        document_version: 3,
        replay_stats: undefined,
        configuration: {
          start_session_replay_recording_manually: jasmine.any(Boolean),
        },
        cls: undefined,
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
        performance: {
          cls: {
            score: 1,
            timestamp: (100 * 1e6) as ServerDuration,
            target_selector: undefined,
            previous_rect: undefined,
            current_rect: undefined,
          },
          fcp: {
            timestamp: (10 * 1e6) as ServerDuration,
          },
          fid: {
            duration: (12 * 1e6) as ServerDuration,
            timestamp: (10 * 1e6) as ServerDuration,
            target_selector: undefined,
          },
          inp: {
            duration: (10 * 1e6) as ServerDuration,
            timestamp: (100 * 1e6) as ServerDuration,
            target_selector: undefined,
          },
          lcp: {
            timestamp: (10 * 1e6) as ServerDuration,
            target_selector: undefined,
            resource_url: undefined,
            sub_parts: undefined,
          },
        },
        resource: {
          count: 10,
        },
        time_spent: (100 * 1e6) as ServerDuration,
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
      device: {
        locale: jasmine.any(String),
        locales: jasmine.any(Array),
        time_zone: jasmine.any(String),
      },
    })
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
      setupViewCollection({ startSessionReplayRecordingManually: false })
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

      expect(
        (rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent)._dd.configuration
          .start_session_replay_recording_manually
      ).toBe(false)
    })

    it('should include startSessionReplayRecordingManually true', () => {
      // when configured to true
      setupViewCollection({ startSessionReplayRecordingManually: true })
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

      expect(
        (rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent)._dd.configuration
          .start_session_replay_recording_manually
      ).toBe(true)
    })
  })

  describe('assembly hook', () => {
    it('should add view properties from the history', () => {
      setupViewCollection({ trackViewsManually: true }, VIEW)

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toEqual(
        jasmine.objectContaining({
          service: VIEW.service,
          version: VIEW.version,
          context: VIEW.context,
          view: {
            id: VIEW.id,
            name: VIEW.name,
          },
        })
      )
    })

    it('should discard the event if no view', () => {
      const viewHistoryEntry = undefined
      setupViewCollection({ trackViewsManually: true }, viewHistoryEntry)
      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)

      expect(defaultRumEventAttributes).toBe(DISCARDED)
    })
  })

  describe('view_update feature flag', () => {
    it('emits full view event for document_version=1', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...VIEW, documentVersion: 1 })
      expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent.type).toBe(RumEventType.VIEW)
    })

    it('emits view_update for document_version > 1 after snapshot established', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      // First event: doc_version=1 establishes snapshot
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...VIEW,
        documentVersion: 1,
        isActive: true,
        id: 'test-view-id',
      })
      // Second event: doc_version=2 should diff
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...VIEW,
        documentVersion: 2,
        isActive: true,
        id: 'test-view-id',
      })
      expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent.type).toBe(RumEventType.VIEW_UPDATE)
    })

    it('emits view_update with only changed action count', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-id',
        eventCounts: { ...VIEW.eventCounts, actionCount: 5 },
      }
      // Establish snapshot
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // Only action count changed
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        eventCounts: { ...baseView.eventCounts, actionCount: 6 },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.type).toBe(RumEventType.VIEW_UPDATE)
      expect(event.view.action).toEqual({ count: 6 })
      expect(event.view.error).toBeUndefined()
    })

    it('emits view_update with only changed error count', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-id',
        eventCounts: { ...VIEW.eventCounts, errorCount: 3 },
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        eventCounts: { ...baseView.eventCounts, errorCount: 4 },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.view.error).toEqual({ count: 4 })
      expect(event.view.action).toBeUndefined()
    })

    it('view_update omits unchanged counters', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id' }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // Nothing changed except duration (time_spent always included)
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        duration: 200 as Duration,
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.type).toBe(RumEventType.VIEW_UPDATE)
      expect(event.view.action).toBeUndefined()
      expect(event.view.error).toBeUndefined()
      expect(event.view.resource).toBeUndefined()
      expect(event.view.long_task).toBeUndefined()
      expect(event.view.frustration).toBeUndefined()
    })

    it('view_update always includes time_spent, omits is_active', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id' }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        duration: 300 as Duration,
        isActive: true,
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.view.time_spent).toBeDefined()
      expect((event.view as any).is_active).toBeUndefined()
    })

    it('view_update includes CLS fields when changed, not redundant performance object', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-id',
        commonViewMetrics: {
          ...VIEW.commonViewMetrics,
          cumulativeLayoutShift: { value: 0.1, time: 50 as Duration },
        },
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        commonViewMetrics: {
          ...baseView.commonViewMetrics,
          cumulativeLayoutShift: { value: 0.5, time: 100 as Duration },
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.view.cumulative_layout_shift).toBe(0.5)
      expect(event.view.performance).toBeUndefined()
    })

    it('view_update omits CLS and performance when unchanged', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id' }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // Same metrics, only duration changed
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        duration: 500 as Duration,
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.view.cumulative_layout_shift).toBeUndefined()
      expect(event.view.performance).toBeUndefined()
    })

    it('view_update includes custom_timings when changed (full object)', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-id',
        customTimings: { foo: 10 as Duration },
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        customTimings: { foo: 10 as Duration, bar: 20 as Duration },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.view.custom_timings).toEqual({
        foo: (10 * 1e6) as ServerDuration,
        bar: (20 * 1e6) as ServerDuration,
      })
    })

    it('view_update omits scroll when unchanged (Duration/ServerDuration unit normalization)', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const scroll = {
        maxDepth: 500,
        maxDepthScrollTop: 100,
        maxScrollHeight: 1200,
        maxScrollHeightTime: 5000 as Duration,
      }
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-id',
        commonViewMetrics: { ...VIEW.commonViewMetrics, scroll },
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // Same scroll — only duration changed
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        duration: 300 as Duration,
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.display).toBeUndefined()
    })

    it('view_update includes scroll when changed', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-id',
        commonViewMetrics: {
          ...VIEW.commonViewMetrics,
          scroll: { maxDepth: 300, maxDepthScrollTop: 0, maxScrollHeight: 1000, maxScrollHeightTime: 3000 as Duration },
        },
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        commonViewMetrics: {
          ...baseView.commonViewMetrics,
          scroll: {
            maxDepth: 700,
            maxDepthScrollTop: 200,
            maxScrollHeight: 1400,
            maxScrollHeightTime: 7000 as Duration,
          },
        },
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event.display?.scroll?.max_depth).toBe(700)
      expect(event.display?.scroll?.max_scroll_height_time).toBe((7000 * 1e6) as ServerDuration)
    })

    it('view_update omits static fields (loading_type, name)', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id', name: 'my-view' }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        duration: 300 as Duration,
      })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect((event.view as any).loading_type).toBeUndefined()
      expect((event.view as any).name).toBeUndefined()
    })

    it('emits full VIEW on view end (is_active=false)', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id' }
      // Establish snapshot
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // View end: is_active=false => full VIEW
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        isActive: false,
      })

      expect(rawRumEvents[0].rawRumEvent.type).toBe(RumEventType.VIEW)
    })

    it('emits full VIEW every FULL_VIEW_REFRESH_INTERVAL updates', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id' }
      // doc_version=1 establishes snapshot
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })

      // Emit 50 partial updates (versions 2..51) — each should be VIEW_UPDATE
      for (let i = 2; i <= 51; i++) {
        lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: i })
      }
      // The 50th diff (version 51) should be VIEW_UPDATE
      expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent.type).toBe(RumEventType.VIEW_UPDATE)

      // The 51st update (version 52) hits FULL_VIEW_REFRESH_INTERVAL=50, so full VIEW
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 52 })
      expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent.type).toBe(RumEventType.VIEW)
    })

    it('emits full VIEW after FULL_VIEW_REFRESH_TIME elapsed', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-id-time' }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // Advance time past FULL_VIEW_REFRESH_TIME (5 * 60_000 ms)
      jasmine.clock().tick(5 * 60_000 + 1_000)

      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 2 })
      expect(rawRumEvents[0].rawRumEvent.type).toBe(RumEventType.VIEW)
    })

    it('new view resets snapshot — doc_version=1 emits full VIEW', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...VIEW,
        documentVersion: 1,
        isActive: true,
        id: 'new-view-id',
      })
      expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent.type).toBe(RumEventType.VIEW)
    })

    it('missing snapshot falls back to full VIEW', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      // Emit doc_version=2 without any prior doc_version=1 snapshot
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...VIEW,
        documentVersion: 2,
        isActive: true,
        id: 'no-snapshot-view',
      })
      expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent.type).toBe(RumEventType.VIEW)
    })

    it('snapshot is updated after each view_update', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = {
        ...VIEW,
        isActive: true,
        id: 'test-view-snap',
        eventCounts: { ...VIEW.eventCounts, actionCount: 1 },
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      // First diff: action count 1 -> 2
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 2,
        eventCounts: { ...baseView.eventCounts, actionCount: 2 },
      })
      const event1 = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event1.view.action).toEqual({ count: 2 })
      rawRumEvents.length = 0

      // Second diff: action count stays at 2 — should be omitted (snapshot was updated)
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...baseView,
        documentVersion: 3,
        eventCounts: { ...baseView.eventCounts, actionCount: 2 },
      })
      const event2 = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event2.view.action).toBeUndefined()
    })

    it('view_update includes replay_stats when changed', () => {
      setupViewCollection()
      addExperimentalFeatures([ExperimentalFeature.VIEW_UPDATE])
      const baseView = { ...VIEW, isActive: true, id: 'test-view-replay' }

      getReplayStatsSpy.and.returnValue(undefined)
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 1 })
      rawRumEvents.length = 0

      const newReplayStats = { records_count: 5, segments_count: 1, segments_total_raw_size: 100 }
      getReplayStatsSpy.and.returnValue(newReplayStats)
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, { ...baseView, documentVersion: 2 })

      const event = rawRumEvents[0].rawRumEvent as RawRumViewUpdateEvent
      expect(event._dd.replay_stats).toEqual(newReplayStats)
    })
  })

  describe('assemble telemetry hook', () => {
    it('should add view id', () => {
      setupViewCollection({ trackViewsManually: true }, VIEW)

      const telemetryEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: VIEW.startClocks.relative,
      }) as DefaultTelemetryEventAttributes

      expect(telemetryEventAttributes.view?.id).toEqual('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    })

    it('should not add view id if no view', () => {
      setupViewCollection({ trackViewsManually: true }, undefined)
      const telemetryEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      }) as DefaultTelemetryEventAttributes

      expect(telemetryEventAttributes.view?.id).toBeUndefined()
    })
  })
})
