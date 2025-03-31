import type { CookieStore } from '@datadog/browser-core'
import { setInterval, clearInterval, Observable, ONE_SECOND, findCommaSeparatedValue } from '@datadog/browser-core'

export interface CookieStoreWindow extends Window {
  cookieStore?: CookieStore
}

export type CookieObservable = ReturnType<typeof createCookieObservable>

export function createCookieObservable(cookieName: string) {
  // NOTE: we don't use cookiestore.addEventListner('change', handler) as it seems to me more prone to bugs
  // and cause our tests to be flaky (and probably in production as well)
  const detectCookieChangeStrategy = watchCookieStrategy

  return new Observable<string | undefined>((observable) =>
    detectCookieChangeStrategy(cookieName, (event) => observable.notify(event))
  )
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND

function watchCookieStrategy(cookieName: string, callback: (event: string | undefined) => void) {
  const previousCookieValue = findCommaSeparatedValue(document.cookie, cookieName)
  const watchCookieIntervalId = setInterval(() => {
    const cookieValue = findCommaSeparatedValue(document.cookie, cookieName)
    if (cookieValue !== previousCookieValue) {
      callback(cookieValue)
    }
  }, WATCH_COOKIE_INTERVAL_DELAY)

  return () => {
    clearInterval(watchCookieIntervalId)
  }
}
