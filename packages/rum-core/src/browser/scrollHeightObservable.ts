import { Observable, setInterval, clearInterval } from '@datadog/browser-core'

export const SCROLL_HEIGHT_OBSERVABLE_INTERVAL_MS = 500

export function createScrollHeightObservable() {
  const observable = new Observable<number>(() => {
    const setIntervalId = setInterval(() => {
      observable.notify(Math.round((document.scrollingElement || document.documentElement).scrollHeight))
    }, SCROLL_HEIGHT_OBSERVABLE_INTERVAL_MS)

    return () => clearInterval(setIntervalId)
  })

  return observable
}
