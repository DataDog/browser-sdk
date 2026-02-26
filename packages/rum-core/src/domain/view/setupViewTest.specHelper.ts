import { Observable, PageExitReason, deepClone } from '@datadog/browser-core'
import { mockRumConfiguration, setupLocationObserver, createMockRumPipeline } from '../../../test'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { ViewCreatedEvent, ViewEvent, ViewOptions, ViewEndedEvent } from './trackViews'
import { trackViews } from './trackViews'

export type ViewTest = ReturnType<typeof setupViewTest>

interface ViewTrackingContext {
  lifeCycle: LifeCycle
  initialLocation?: string
  partialConfig?: Partial<RumConfiguration>
}

export function setupViewTest(
  { lifeCycle, initialLocation, partialConfig }: ViewTrackingContext,
  initialViewOptions?: ViewOptions
) {
  const domMutationObservable = new Observable<RumMutationRecord[]>()
  const windowOpenObservable = new Observable<void>()
  const configuration = mockRumConfiguration(partialConfig)
  const { locationChangeObservable, changeLocation } = setupLocationObserver(initialLocation)

  // Create a synchronous mock pipeline for signal-based lifecycle events.
  // The mock fires signal handlers synchronously, which allows existing test patterns
  // (synchronous assertions after lifeCycle.notify) to keep working.
  const pipeline = createMockRumPipeline()

  // Bridge: when lifeCycle notifies SESSION_EXPIRED/SESSION_RENEWED/PAGE_MAY_EXIT, also fire pipeline signals.
  // This allows existing tests to continue using lifeCycle.notify() as signal producers.
  lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    pipeline.notifySignal({ type: 'sessionExpired' })
  })
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    pipeline.notifySignal({ type: 'sessionRenewed', sessionId: 'test-session-id' })
  })
  lifeCycle.subscribe(LifeCycleEventType.PAGE_MAY_EXIT, (event) => {
    const reason =
      event.reason === PageExitReason.HIDDEN
        ? ('visibility_hidden' as const)
        : event.reason === PageExitReason.PAGEHIDE
          ? ('page_hide' as const)
          : event.reason === PageExitReason.FROZEN
            ? ('page_frozen' as const)
            : ('before_unload' as const)
    pipeline.notifySignal({ type: 'pageMayExit', reason })
  })

  const {
    handler: viewUpdateHandler,
    getViewEvent: getViewUpdate,
    getHandledCount: getViewUpdateCount,
  } = spyOnViews<ViewEvent>()
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, viewUpdateHandler)

  const {
    handler: viewCreateHandler,
    getViewEvent: getViewCreate,
    getHandledCount: getViewCreateCount,
  } = spyOnViews<ViewCreatedEvent>()
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, viewCreateHandler)

  const {
    handler: viewEndHandler,
    getViewEvent: getViewEnd,
    getHandledCount: getViewEndCount,
  } = spyOnViews<ViewEndedEvent>()
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, viewEndHandler)

  const {
    stop,
    startView,
    setViewName,
    setViewContext,
    setViewContextProperty,
    getViewContext,
    addTiming,
    setLoadingTime,
  } = trackViews(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions,
    pipeline
  )
  return {
    stop,
    startView,
    setViewContext,
    setViewContextProperty,
    getViewContext,
    changeLocation,
    setViewName,
    addTiming,
    setLoadingTime,
    getViewUpdate,
    getViewUpdateCount,
    getViewCreate,
    getViewCreateCount,
    getViewEnd,
    getViewEndCount,
    getLatestViewContext: () => ({
      id: getViewCreate(getViewCreateCount() - 1).id,
    }),
  }
}

function spyOnViews<Event>() {
  const events: Event[] = []

  return {
    handler: (event: Event) => {
      events.push(
        // Some properties can be mutated later
        deepClone(event)
      )
    },

    getViewEvent: (index: number) => events[index],

    getHandledCount: () => events.length,
  }
}
