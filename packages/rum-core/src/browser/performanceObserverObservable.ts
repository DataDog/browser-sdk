import { Observable } from '@datadog/browser-core'

const POLL_INTERVAL = 3000

export const performanceObserverObservable = () => {
  const wrapperObserver = new Observable<PerformanceEntry[]>()

  if (window.PerformanceObserver) {
    const performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      wrapperObserver.notify(entries)
    })

    performanceObserver.observe({ type: 'resource', buffered: true })
  } else {
    setInterval(function () {
      if (wrapperObserver.hasSubscribers()) {
        wrapperObserver.notify(performance.getEntriesByType('resource'))
      }
    }, POLL_INTERVAL)
  }

  return wrapperObserver
}
