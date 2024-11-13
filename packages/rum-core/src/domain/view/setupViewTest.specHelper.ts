import { Observable, deepClone } from '@datadog/browser-core'
import { mockRumConfiguration, setupLocationObserver } from '../../../test'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEvent, ViewOptions, ViewEndedEvent } from './trackViews'
import { trackViews } from './trackViews'

export type ViewTest = ReturnType<typeof setupViewTest>

interface ViewTrackingContext {
  lifeCycle: LifeCycle
  initialLocation?: string
}

export function setupViewTest({ lifeCycle, initialLocation }: ViewTrackingContext, initialViewOptions?: ViewOptions) {
  const domMutationObservable = new Observable<void>()
  const configuration = mockRumConfiguration()
  const { locationChangeObservable, changeLocation } = setupLocationObserver(initialLocation)

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

  const { stop, startView, setViewName, setViewContext, setViewContextProperty, addTiming } = trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  )
  return {
    stop,
    startView,
    setViewContext,
    setViewContextProperty,
    changeLocation,
    setViewName,
    addTiming,
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
