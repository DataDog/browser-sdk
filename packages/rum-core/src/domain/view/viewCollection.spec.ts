import { DISCARDED, ExperimentalFeature, HookNames, Observable } from '@datadog/browser-core'
import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { mockClock, mockExperimentalFeatures, registerCleanupTask } from '@datadog/browser-core/test'
import type { RecorderApi } from '../../boot/rumPublicApi'
import { collectAndValidateRawRumEvents, mockRumConfiguration, mockViewHistory, noopRecorderApi } from '../../../test'
import type { RawRumEvent, RawRumViewEvent } from '../../rawRumEvent.types'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { LocationChange } from '../../browser/locationChangeObservable'
import type { ViewHistoryEntry } from '../contexts/viewHistory'
import type { AssembleHookParams, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { SoftNavigationContexts } from '../softNavigation/softNavigationCollection'
import { startViewCollection } from './viewCollection'
import type { ViewEvent } from './trackViews'

const noopSoftNavigationContexts: SoftNavigationContexts = {
  findSoftNavigationByTime: () => undefined,
  findAll: () => [],
}

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
      location,
      domMutationObservable,
      windowOpenObservable,
      locationChangeObservable,
      {
        ...noopRecorderApi,
        getReplayStats: getReplayStatsSpy,
      },
      viewHistory,
      noopSoftNavigationContexts
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

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234 as RelativeTime)
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

  describe('soft navigation correlation', () => {
    function setupViewCollectionWithSoftNav(softNavContexts: SoftNavigationContexts) {
      mockExperimentalFeatures([ExperimentalFeature.SOFT_NAVIGATION])
      hooks = createHooks()
      const viewHistory = mockViewHistory()
      getReplayStatsSpy = jasmine.createSpy()
      const domMutationObservable = new Observable<RumMutationRecord[]>()
      const windowOpenObservable = new Observable<void>()
      const locationChangeObservable = new Observable<LocationChange>()
      mockClock()

      const collectionResult = startViewCollection(
        lifeCycle,
        hooks,
        mockRumConfiguration(),
        location,
        domMutationObservable,
        windowOpenObservable,
        locationChangeObservable,
        {
          ...noopRecorderApi,
          getReplayStats: getReplayStatsSpy,
        },
        viewHistory,
        softNavContexts
      )

      rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

      registerCleanupTask(() => {
        collectionResult.stop()
        viewHistory.stop()
      })
      return collectionResult
    }

    it('should set navigation.soft to true on route_change view when soft-nav entry exists at query time', () => {
      const softNavContexts: SoftNavigationContexts = {
        findSoftNavigationByTime: () => undefined,
        findAll: (startTime?: RelativeTime) => {
          if (startTime === (1234 as RelativeTime)) {
            return [{ navigationId: 'nav-1', name: 'https://example.com/page', startTime: 1235 as RelativeTime }]
          }
          return []
        },
      }
      setupViewCollectionWithSoftNav(softNavContexts)

      const routeChangeView: ViewEvent = {
        ...VIEW,
        loadingType: ViewLoadingType.ROUTE_CHANGE,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, routeChangeView)

      const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(rawRumViewEvent.view.navigation).toEqual({ soft: true })
    })

    it('should set navigation.soft to true on subsequent update when soft-nav entry arrives late', () => {
      let softNavAvailable = false
      const viewStartTime = 1234 as RelativeTime
      const softNavContexts: SoftNavigationContexts = {
        findSoftNavigationByTime: () => undefined,
        findAll: (startTime?: RelativeTime) => {
          if (softNavAvailable && startTime === viewStartTime) {
            return [{ navigationId: 'nav-1', name: 'https://example.com/page', startTime: 1235 as RelativeTime }]
          }
          return []
        },
      }
      setupViewCollectionWithSoftNav(softNavContexts)

      const routeChangeView: ViewEvent = {
        ...VIEW,
        loadingType: ViewLoadingType.ROUTE_CHANGE,
        startClocks: { relative: viewStartTime, timeStamp: 123456789 as TimeStamp },
        documentVersion: 1,
      }

      // First update: soft-nav entry not yet available
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, routeChangeView)
      const firstEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(firstEvent.view.navigation).toEqual({ soft: false })

      // Simulate soft-nav entry arriving (PerformanceObserver callback)
      softNavAvailable = true

      // Second update: e.g. view end triggers triggerViewUpdate, or event count change
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        ...routeChangeView,
        documentVersion: 2,
        isActive: false,
      })
      const secondEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(secondEvent.view.navigation).toEqual({ soft: true })
    })

    it('should correctly attribute soft-nav entries to respective views during rapid navigations', () => {
      const viewAStartTime = 1000 as RelativeTime
      const viewBStartTime = 1100 as RelativeTime
      const softNavContexts: SoftNavigationContexts = {
        findSoftNavigationByTime: () => undefined,
        findAll: (startTime?: RelativeTime) => {
          if (startTime === viewAStartTime) {
            return [{ navigationId: 'nav-a', name: 'https://example.com/page-a', startTime: 1002 as RelativeTime }]
          }
          if (startTime === viewBStartTime) {
            return [{ navigationId: 'nav-b', name: 'https://example.com/page-b', startTime: 1102 as RelativeTime }]
          }
          return []
        },
      }
      setupViewCollectionWithSoftNav(softNavContexts)

      // View A: route_change, ends quickly
      const viewA: ViewEvent = {
        ...VIEW,
        id: 'view-a',
        loadingType: ViewLoadingType.ROUTE_CHANGE,
        startClocks: { relative: viewAStartTime, timeStamp: 100000 as TimeStamp },
        documentVersion: 2,
        isActive: false,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, viewA)
      const viewAEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(viewAEvent.view.navigation).toEqual({ soft: true })

      // View B: route_change, also annotated with its own entry
      const viewB: ViewEvent = {
        ...VIEW,
        id: 'view-b',
        loadingType: ViewLoadingType.ROUTE_CHANGE,
        startClocks: { relative: viewBStartTime, timeStamp: 100100 as TimeStamp },
        documentVersion: 1,
        isActive: true,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, viewB)
      const viewBEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(viewBEvent.view.navigation).toEqual({ soft: true })
    })

    it('should set navigation.soft to false on route_change view when no soft-nav entry exists (programmatic pushState)', () => {
      const softNavContexts: SoftNavigationContexts = {
        findSoftNavigationByTime: () => undefined,
        findAll: () => [],
      }
      setupViewCollectionWithSoftNav(softNavContexts)

      const routeChangeView: ViewEvent = {
        ...VIEW,
        loadingType: ViewLoadingType.ROUTE_CHANGE,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, routeChangeView)

      const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(rawRumViewEvent.view.navigation).toEqual({ soft: false })
    })

    it('should set navigation.soft to false on initial_load view even when soft-nav entry matches time range', () => {
      const softNavContexts: SoftNavigationContexts = {
        findSoftNavigationByTime: () => undefined,
        findAll: () => [{ navigationId: 'nav-1', name: 'https://example.com/page', startTime: 1235 as RelativeTime }],
      }
      setupViewCollectionWithSoftNav(softNavContexts)

      // VIEW fixture defaults to INITIAL_LOAD loading type
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, VIEW)

      const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(rawRumViewEvent.view.navigation).toEqual({ soft: false })
      expect(rawRumViewEvent.view.loading_type).toBe(ViewLoadingType.INITIAL_LOAD)
    })

    it('should preserve all existing view fields when navigation.soft is true', () => {
      const softNavContexts: SoftNavigationContexts = {
        findSoftNavigationByTime: () => undefined,
        findAll: (startTime?: RelativeTime) => {
          if (startTime === (1234 as RelativeTime)) {
            return [{ navigationId: 'nav-1', name: 'https://example.com/page', startTime: 1235 as RelativeTime }]
          }
          return []
        },
      }
      setupViewCollectionWithSoftNav(softNavContexts)

      const routeChangeView: ViewEvent = {
        ...VIEW,
        loadingType: ViewLoadingType.ROUTE_CHANGE,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, routeChangeView)

      const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent

      // Verify soft navigation annotation is present
      expect(rawRumViewEvent.view.navigation).toEqual({ soft: true })

      // Verify all existing fields are unchanged (same values as the baseline 'should create view from view update' test)
      expect(rawRumViewEvent.view.loading_type).toBe(ViewLoadingType.ROUTE_CHANGE)
      expect(rawRumViewEvent.view.time_spent).toBe((100 * 1e6) as ServerDuration)
      expect(rawRumViewEvent.view.is_active).toBe(false)
      expect(rawRumViewEvent.view.loading_time).toBe((20 * 1e6) as ServerDuration)
      expect(rawRumViewEvent.view.error.count).toBe(10)
      expect(rawRumViewEvent.view.resource.count).toBe(10)
      expect(rawRumViewEvent.view.action.count).toBe(10)
      expect(rawRumViewEvent.view.long_task.count).toBe(10)
      expect(rawRumViewEvent.view.frustration.count).toBe(10)
      expect(rawRumViewEvent.view.first_contentful_paint).toBe((10 * 1e6) as ServerDuration)
      expect(rawRumViewEvent.view.largest_contentful_paint).toBe((10 * 1e6) as ServerDuration)
      expect(rawRumViewEvent.view.first_input_delay).toBe((12 * 1e6) as ServerDuration)
      expect(rawRumViewEvent.view.cumulative_layout_shift).toBe(1)
      expect(rawRumViewEvent.view.interaction_to_next_paint).toBe((10 * 1e6) as ServerDuration)
      expect(rawRumViewEvent.view.custom_timings).toEqual({
        bar: (20 * 1e6) as ServerDuration,
        foo: (10 * 1e6) as ServerDuration,
      })
      expect(rawRumViewEvent._dd.document_version).toBe(3)
      expect(rawRumViewEvent.display?.scroll).toEqual({
        max_depth: 2000,
        max_depth_scroll_top: 1000,
        max_scroll_height: 3000,
        max_scroll_height_time: 4000000000000000 as ServerDuration,
      })
    })

    it('should set navigation.soft to false on route_change view when browser does not support soft navigation (noop contexts)', () => {
      setupViewCollectionWithSoftNav(noopSoftNavigationContexts)

      const routeChangeView: ViewEvent = {
        ...VIEW,
        loadingType: ViewLoadingType.ROUTE_CHANGE,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, routeChangeView)

      const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(rawRumViewEvent.view.navigation).toEqual({ soft: false })
      // Verify loading_type is still route_change (not affected)
      expect(rawRumViewEvent.view.loading_type).toBe(ViewLoadingType.ROUTE_CHANGE)
    })

    it('should not include navigation field when experimental flag is not enabled', () => {
      setupViewCollection()

      const routeChangeView: ViewEvent = {
        ...VIEW,
        loadingType: ViewLoadingType.ROUTE_CHANGE,
      }
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, routeChangeView)

      const rawRumViewEvent = rawRumEvents[rawRumEvents.length - 1].rawRumEvent as RawRumViewEvent
      expect(rawRumViewEvent.view.navigation).toBeUndefined()
    })
  })
})
