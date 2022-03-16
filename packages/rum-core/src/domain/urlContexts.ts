import type { RelativeTime, Observable, ContextHistoryEntry } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, relativeNow, ContextHistory } from '@datadog/browser-core'
import type { UrlContext } from '../rawRumEvent.types'
import type { LocationChange } from '../browser/locationChangeObservable'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

/**
 * We want to attach to an event:
 * - the url corresponding to its start
 * - the referrer corresponding to the previous view url (or document referrer for initial view)
 */

export const URL_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface UrlContexts {
  findUrl: (startTime?: RelativeTime) => UrlContext | undefined
  stop: () => void
}

export function startUrlContexts(
  lifeCycle: LifeCycle,
  locationChangeObservable: Observable<LocationChange>,
  location: Location
) {
  const urlContextHistory = new ContextHistory<UrlContext>(URL_CONTEXT_TIME_OUT_DELAY)

  let previousViewUrl: string | undefined

  let currentHistoryEntry: ContextHistoryEntry<UrlContext> | undefined
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    if (currentHistoryEntry) {
      currentHistoryEntry.close(endClocks.relative)
      currentHistoryEntry = undefined
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ startClocks }) => {
    const viewUrl = location.href
    currentHistoryEntry = urlContextHistory.add(
      buildUrlContext({
        url: viewUrl,
        referrer: !previousViewUrl ? document.referrer : previousViewUrl,
      }),
      startClocks.relative
    )
    previousViewUrl = viewUrl
  })

  const locationChangeSubscription = locationChangeObservable.subscribe(({ newLocation }) => {
    if (currentHistoryEntry) {
      const changeTime = relativeNow()
      currentHistoryEntry.close(changeTime)
      currentHistoryEntry = urlContextHistory.add(
        buildUrlContext({
          url: newLocation.href,
          referrer: currentHistoryEntry.context.view.referrer,
        }),
        changeTime
      )
    }
  })

  function buildUrlContext({ url, referrer }: { url: string; referrer: string }) {
    return {
      view: {
        url,
        referrer,
      },
    }
  }

  return {
    findUrl: (startTime?: RelativeTime) => urlContextHistory.find(startTime),
    stop: () => {
      locationChangeSubscription.unsubscribe()
      urlContextHistory.stop()
    },
  }
}
