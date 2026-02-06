import { Observable } from '../tools/observable'
import { setInterval, clearInterval } from '../tools/timer'
import { ONE_SECOND } from '../tools/utils/timeUtils'
import { findCommaSeparatedValue } from '../tools/utils/stringUtils'
import { addEventListener, DOM_EVENT } from './addEventListener'
import type { CookieStore } from './browser.types'

export interface CookieStoreWindow {
  cookieStore?: CookieStore
}

export type CookieObservable = ReturnType<typeof createCookieObservable>

interface EventListenerConfiguration {
  allowUntrustedEvents?: boolean | undefined
}

export function createCookieObservable(configuration: EventListenerConfiguration, cookieName: string) {
  const detectCookieChangeStrategy = (window as CookieStoreWindow).cookieStore
    ? listenToCookieStoreChange(configuration)
    : watchCookieFallback

  return new Observable<string | undefined>((observable) =>
    detectCookieChangeStrategy(cookieName, (event) => observable.notify(event))
  )
}

function listenToCookieStoreChange(configuration: EventListenerConfiguration) {
  return (cookieName: string, callback: (event: string | undefined) => void) => {
    const listener = addEventListener(
      configuration,
      (window as CookieStoreWindow).cookieStore!,
      DOM_EVENT.CHANGE,
      (event) => {
        // Based on our experimentation, we're assuming that entries for the same cookie cannot be in both the 'changed' and 'deleted' arrays.
        // However, due to ambiguity in the specification, we asked for clarification: https://github.com/WICG/cookie-store/issues/226
        const changeEvent =
          event.changed.find((event) => event.name === cookieName) ||
          event.deleted.find((event) => event.name === cookieName)
        if (changeEvent) {
          callback(changeEvent.value)
        }
      }
    )
    return listener.stop
  }
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND

function watchCookieFallback(cookieName: string, callback: (event: string | undefined) => void) {
  let previousCookieValue = findCommaSeparatedValue(document.cookie, cookieName)
  const watchCookieIntervalId = setInterval(() => {
    const cookieValue = findCommaSeparatedValue(document.cookie, cookieName)
    if (cookieValue !== previousCookieValue) {
      previousCookieValue = cookieValue
      callback(cookieValue)
    }
  }, WATCH_COOKIE_INTERVAL_DELAY)

  return () => {
    clearInterval(watchCookieIntervalId)
  }
}

export function createLocalStorageObservable(
  configuration: EventListenerConfiguration,
  key: string
): Observable<string | undefined> {
  return new Observable((observable) => {
    const { stop } = addEventListener(configuration, window, DOM_EVENT.STORAGE, (event) => {
      if (event.key === key) {
        observable.notify(event.newValue ?? undefined)
      }
    })
    return stop
  })
}
