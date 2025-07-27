import { Observable, deepClone } from '@datadog/browser-core'
import { registerCleanupTask } from '../../../../core/test'
import { mockRumConfiguration, setupLocationObserver } from '../../../test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { ViewCreatedEvent, ViewEvent, ViewOptions, ViewEndedEvent } from './trackViews'
import { trackViews } from './trackViews'

export type ViewTest = ReturnType<typeof setupViewTest>

interface ViewTestOptions {
  initialLocation?: string
  partialConfig?: Partial<RumConfiguration>
  initialViewOptions?: ViewOptions
}

export function setupViewTest({ initialLocation, partialConfig, initialViewOptions }: ViewTestOptions = {}) {
  const lifeCycle = new LifeCycle()
  const domMutationObservable = new Observable<RumMutationRecord[]>()
  const windowOpenObservable = new Observable<void>()
  const configuration = mockRumConfiguration(partialConfig)
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

  const { stop, startView, setViewName, setViewContext, setViewContextProperty, getViewContext, addTiming } =
    trackViews(
      location,
      lifeCycle,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      locationChangeObservable,
      !configuration.trackViewsManually,
      initialViewOptions
    )

  registerCleanupTask(stop)

  return {
    lifeCycle,
    startView,
    setViewContext,
    setViewContextProperty,
    getViewContext,
    changeLocation,
    setViewName,
    addTiming,
    getViewUpdate,
    getViewUpdateCount,
    getViewCreate,
    getViewCreateCount,
    getViewEnd,
    getViewEndCount,
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
