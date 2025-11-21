import { Observable } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { CollectedRumEvent } from './events'

export function startActivityTracking(onRumEventObservable: Observable<CollectedRumEvent>) {
  const onActivityObservable = new Observable<void>()
  const alreadySeenViewIds = new Set()
  onRumEventObservable.subscribe(({ event }) => {
    if (event.type === RumEventType.VIEW && !alreadySeenViewIds.has(event.view.id)) {
      alreadySeenViewIds.add(event.view.id)
      onActivityObservable.notify()
    } else if (event.type === RumEventType.ACTION && event.action.type === 'click') {
      onActivityObservable.notify()
    }
  })
  return onActivityObservable
}
