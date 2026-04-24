import { clearInterval, setInterval } from '@datadog/browser-core'
import type { TimeoutId } from '@datadog/browser-core'
import type { RumPublicApi, ViewOptions } from '@datadog/browser-rum-core'

export interface SalesforceLocation {
  pathname?: string
  href?: string
}

interface StartSalesforceViewTrackingOptions {
  getRumPublicApi: () => Pick<RumPublicApi, 'startView'> | undefined
  getLocation?: () => SalesforceLocation | undefined
  pollInterval?: number
}

interface SalesforceView {
  key: string
  url?: string
}

const DEFAULT_LOCATION_POLL_INTERVAL = 500

export function startSalesforceViewTracking(options: StartSalesforceViewTrackingOptions) {
  const getLocation = options.getLocation ?? getNavigationLocation
  const pollInterval = options.pollInterval ?? DEFAULT_LOCATION_POLL_INTERVAL

  let lastEmittedRouteKey: string | undefined
  let pollIntervalId: TimeoutId | undefined

  trackCurrentView()
  pollIntervalId = setInterval(trackCurrentView, pollInterval)

  function trackCurrentView() {
    const currentView = resolveCurrentView(getLocation())

    if (!currentView || currentView.key === lastEmittedRouteKey) {
      return
    }

    const rumPublicApi = options.getRumPublicApi()

    if (!rumPublicApi) {
      return
    }

    rumPublicApi.startView(toViewOptions(currentView))
    lastEmittedRouteKey = currentView.key
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
    return normalizePathname(new URL(href).pathname)
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
    return new URL(href).href
  } catch {
    return undefined
  }
}
