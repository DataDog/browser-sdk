import type { BuildContext } from '../../../test'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewEvent, ViewOptions } from './trackViews'
import { trackViews } from './trackViews'

export type ViewTest = ReturnType<typeof setupViewTest>

export function setupViewTest(
  {
    lifeCycle,
    location,
    domMutationObservable,
    performanceResourceObservable,
    configuration,
    locationChangeObservable,
  }: BuildContext,
  initialViewOptions?: ViewOptions
) {
  const {
    handler: viewUpdateHandler,
    getViewEvent: getViewUpdate,
    getHandledCount: getViewUpdateCount,
  } = spyOnViews('view update')
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, viewUpdateHandler)

  const {
    handler: viewCreateHandler,
    getViewEvent: getViewCreate,
    getHandledCount: getViewCreateCount,
  } = spyOnViews('view create')
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, viewCreateHandler)

  const { handler: viewEndHandler, getViewEvent: getViewEnd, getHandledCount: getViewEndCount } = spyOnViews('view end')
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, viewEndHandler)

  const { stop, startView, addTiming } = trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    performanceResourceObservable,
    configuration,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewOptions
  )
  return {
    stop,
    startView,
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

function spyOnViews(name?: string) {
  const handler = jasmine.createSpy(name)

  function getViewEvent(index: number) {
    return handler.calls.argsFor(index)[0] as ViewEvent
  }

  function getHandledCount() {
    return handler.calls.count()
  }

  return { handler, getViewEvent, getHandledCount }
}
