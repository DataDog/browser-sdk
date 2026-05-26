import { buildUrl, clearInterval, relativeNow, setInterval } from '@datadog/browser-core'
import type { RelativeTime, TimeoutId } from '@datadog/browser-core'
import type { RumPublicApi, ViewOptions } from '@datadog/browser-rum-core'

export interface SalesforceLocation {
  pathname?: string
  href?: string
}

export interface SalesforcePerformanceResourceTiming {
  responseEnd?: number
}

interface StartSalesforceViewTrackingOptions {
  getRumPublicApi: () => Pick<RumPublicApi, 'startView' | 'setViewLoadingTime'> | undefined
  getLocation?: () => SalesforceLocation | undefined
  getPerformanceEntries?: () => SalesforcePerformanceResourceTiming[] | undefined
  getCurrentRelativeTime?: () => RelativeTime
  pollInterval?: number
}

interface SalesforceView {
  key: string
  url?: string
}

interface TrackedSalesforceView extends SalesforceView {
  startRelativeTime: RelativeTime
  latestLoadingTimeResponseEnd?: RelativeTime
  isLoadingTimeFinalized: boolean
}

const DEFAULT_LOCATION_POLL_INTERVAL = 500

export function startSalesforceViewTracking(options: StartSalesforceViewTrackingOptions) {
  const getLocation = options.getLocation ?? getNavigationLocation
  const getPerformanceEntries = options.getPerformanceEntries ?? getResourcePerformanceEntries
  const getCurrentRelativeTime = options.getCurrentRelativeTime ?? relativeNow
  const pollInterval = options.pollInterval ?? DEFAULT_LOCATION_POLL_INTERVAL

  let lastEmittedRouteKey: string | undefined
  let pollIntervalId: TimeoutId | undefined
  let trackedView: TrackedSalesforceView | undefined

  trackSalesforceView()
  pollIntervalId = setInterval(trackSalesforceView, pollInterval)

  // We currently use the poll completion time as an approximate loading time.
  // If we want the exact resource completion timestamp later, we can pass the latest
  // `responseEnd` converted to an absolute time to `setViewLoadingTime(time)`.
  function trackSalesforceView() {
    const performanceEntries = getPerformanceEntries()
    const currentView = resolveCurrentView(getLocation())

    if (currentView && currentView.key !== lastEmittedRouteKey) {
      const rumPublicApi = options.getRumPublicApi()

      if (rumPublicApi) {
        rumPublicApi.startView(toViewOptions(currentView))
        trackedView = {
          ...currentView,
          startRelativeTime: getCurrentRelativeTime(),
          isLoadingTimeFinalized: false,
        }
        lastEmittedRouteKey = currentView.key
      }
    }

    if (!trackedView || trackedView.isLoadingTimeFinalized) {
      return
    }

    const latestResponseEnd = getLatestViewResourceResponseEnd(performanceEntries, trackedView.startRelativeTime)

    if (
      latestResponseEnd !== undefined &&
      (!trackedView.latestLoadingTimeResponseEnd || latestResponseEnd > trackedView.latestLoadingTimeResponseEnd)
    ) {
      trackedView.latestLoadingTimeResponseEnd = latestResponseEnd
      return
    }

    if (trackedView.latestLoadingTimeResponseEnd !== undefined) {
      options.getRumPublicApi()?.setViewLoadingTime()
      trackedView.isLoadingTimeFinalized = true
    }
  }

  return {
    stop() {
      clearInterval(pollIntervalId)
      pollIntervalId = undefined
    },
  }
}

function getNavigationLocation(): SalesforceLocation | undefined {
  try {
    return {
      href: window.location.href,
      pathname: window.location.pathname,
    }
  } catch {
    return undefined
  }
}

function getResourcePerformanceEntries(): SalesforcePerformanceResourceTiming[] | undefined {
  try {
    return window.performance.getEntriesByType('resource') as SalesforcePerformanceResourceTiming[]
  } catch {
    return undefined
  }
}

function getLatestViewResourceResponseEnd(
  entries: SalesforcePerformanceResourceTiming[] | undefined,
  viewStartRelativeTime: RelativeTime
) {
  if (!entries) {
    return undefined
  }

  let latestResponseEnd: RelativeTime | undefined

  for (const entry of entries) {
    const responseEnd = entry.responseEnd

    if (typeof responseEnd !== 'number' || responseEnd < viewStartRelativeTime) {
      continue
    }

    if (latestResponseEnd === undefined || responseEnd > latestResponseEnd) {
      latestResponseEnd = responseEnd as RelativeTime
    }
  }

  return latestResponseEnd
}

function resolveCurrentView(location: SalesforceLocation | undefined): SalesforceView | undefined {
  if (!location) {
    return undefined
  }

  const url = normalizeLocationHref(location.href)
  const key = normalizePathname(location.pathname) ?? getPathnameFromHref(url)

  if (!key) {
    return undefined
  }

  return {
    key,
    url,
  }
}

function toViewOptions(view: SalesforceView): ViewOptions {
  return view.url ? { name: view.key, url: view.url } : { name: view.key }
}

function getPathnameFromHref(href: string | undefined) {
  if (!href) {
    return undefined
  }

  try {
    return normalizePathname(buildUrl(href).pathname)
  } catch {
    return undefined
  }
}

function normalizePathname(pathname: unknown) {
  if (typeof pathname !== 'string' || !pathname.trim()) {
    return undefined
  }

  let normalizedPathname = pathname.trim()

  if (!normalizedPathname.startsWith('/')) {
    normalizedPathname = `/${normalizedPathname}`
  }

  if (normalizedPathname.length > 1) {
    normalizedPathname = normalizedPathname.replace(/\/+$/, '')
  }

  return normalizedPathname || '/'
}

function normalizeLocationHref(href: unknown) {
  if (typeof href !== 'string' || !href.trim()) {
    return undefined
  }

  try {
    return buildUrl(href).href
  } catch {
    return undefined
  }
}
