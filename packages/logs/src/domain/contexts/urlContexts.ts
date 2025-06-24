import type { LocationChange, Observable, Subscription, ValueHistory } from '@datadog/browser-core'
import {
  SESSION_TIME_OUT_DELAY,
  relativeNow,
  HookNames,
  createValueHistory,
  DISCARDED,
  createLocationChangeObservable,
} from '@datadog/browser-core'
import type { Hooks } from '../hooks'
import type { LogsConfiguration } from '../configuration'

export const URL_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface UrlContext {
  url: string
  referrer: string
  [k: string]: unknown
}

let urlContextHistory: ValueHistory<UrlContext>
let locationChangeSubscription: Subscription | undefined

export function startUrlContextHistory(
  location: Location,
  locationChangeObservable: Observable<LocationChange> = createLocationChangeObservable(
    // startUrlContextHistory is called from preStartLogs.ts before the full configuration is available,
    // so a minimal placeholder configuration is used here.
    { allowUntrustedEvents: false } as LogsConfiguration,
    location
  )
) {
  urlContextHistory = createValueHistory<UrlContext>({ expireDelay: URL_CONTEXT_TIME_OUT_DELAY })
  urlContextHistory.add({ url: location.href, referrer: document.referrer }, relativeNow())

  locationChangeSubscription = locationChangeObservable.subscribe(({ newLocation }) => {
    const changeTime = relativeNow()
    urlContextHistory.closeActive(changeTime)
    urlContextHistory.add({ url: newLocation.href, referrer: document.referrer }, changeTime)
  })
}

export function stopUrlContextHistory() {
  urlContextHistory?.stop()
  locationChangeSubscription?.unsubscribe()
}

export function startUrlContexts(hooks: Hooks) {
  hooks.register(HookNames.Assemble, ({ startTime }) => {
    const urlContext = urlContextHistory.find(startTime)

    if (!urlContext) {
      return DISCARDED
    }

    return {
      view: urlContext,
    }
  })
}
