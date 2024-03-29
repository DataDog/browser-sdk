import type { Configuration, CookieStore } from '@datadog/browser-core'
import {
  setInterval,
  clearInterval,
  Observable,
  addEventListener,
  ONE_SECOND,
  findCommaSeparatedValue,
  DOM_EVENT,
} from '@datadog/browser-core'

export interface CookieStoreWindow extends Window {
  cookieStore?: CookieStore
}

export type CookieObservable = ReturnType<typeof createCookieObservable>

export type CookieChange = { name: string; value: string | undefined }

export function createCookieObservable(configuration: Configuration, cookieName: string) {
  const detectCookieChangeStrategy = (window as CookieStoreWindow).cookieStore
    ? listenToCookieStoreChange(configuration)
    : watchCookieFallback

  return new Observable<CookieChange>((observable) =>
    detectCookieChangeStrategy(cookieName, (event) => observable.notify(event))
  )
}

function listenToCookieStoreChange(configuration: Configuration) {
  return (cookieName: string, callback: (event: CookieChange) => void) => {
    const listener = addEventListener(
      configuration,
      (window as CookieStoreWindow).cookieStore!,
      DOM_EVENT.CHANGE,
      (event) => {
        // Based on our experimentation, we're assuming that entries for the same cookie cannot be in both the 'changed' and 'deleted' arrays.
        // However, due to ambiguity in the specification, we asked for clarification: https://github.com/WICG/cookie-store/issues/226
        event.changed
          .concat(event.deleted)
          .filter((change) => change.name === cookieName)
          .forEach((change) => {
            callback({
              name: change.name,
              value: change.value,
            })
          })
      }
    )
    return listener.stop
  }
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND

function watchCookieFallback(cookieName: string, callback: (event: CookieChange) => void) {
  const previousCookieValue = findCommaSeparatedValue(document.cookie, cookieName)
  const watchCookieIntervalId = setInterval(() => {
    const cookieValue = findCommaSeparatedValue(document.cookie, cookieName)
    if (cookieValue !== previousCookieValue) {
      callback({ name: cookieName, value: cookieValue })
    }
  }, WATCH_COOKIE_INTERVAL_DELAY)

  return () => {
    clearInterval(watchCookieIntervalId)
  }
}
