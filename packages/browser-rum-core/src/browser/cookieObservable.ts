import { ONE_SECOND } from '@datadog/js-core/time'
import {
  setInterval,
  clearInterval,
  Observable,
  addEventListener,
  DOM_EVENT,
  getCookie,
  globalObject,
  isCookieStoreSupported,
} from '@datadog/browser-core'

export type CookieObservable = ReturnType<typeof createCookieObservable>

export function createCookieObservable(cookieName: string) {
  const detectCookieChangeStrategy = isCookieStoreSupported() ? listenToCookieStoreChange() : watchCookieFallback

  return new Observable<string | undefined>((observable) =>
    detectCookieChangeStrategy(cookieName, (event) => observable.notify(event))
  )
}

function listenToCookieStoreChange() {
  return (cookieName: string, callback: (event: string | undefined) => void) => {
    const listener = addEventListener(globalObject.cookieStore!, DOM_EVENT.CHANGE, (event) => {
      // Based on our experimentation, we're assuming that entries for the same cookie cannot be in both the 'changed' and 'deleted' arrays.
      // However, due to ambiguity in the specification, we asked for clarification: https://github.com/WICG/cookie-store/issues/226
      const changeEvent =
        event.changed.find((event) => event.name === cookieName) ||
        event.deleted.find((event) => event.name === cookieName)
      if (changeEvent) {
        callback(changeEvent.value)
      }
    })
    return listener.stop
  }
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND

function watchCookieFallback(cookieName: string, callback: (event: string | undefined) => void) {
  let previousCookieValue = getCookie(cookieName)
  const watchCookieIntervalId = setInterval(() => {
    const cookieValue = getCookie(cookieName)
    if (cookieValue !== previousCookieValue) {
      previousCookieValue = cookieValue
      callback(cookieValue)
    }
  }, WATCH_COOKIE_INTERVAL_DELAY)

  return () => {
    clearInterval(watchCookieIntervalId)
  }
}
