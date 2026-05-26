import { addEventListener, buildUrl, DOM_EVENT, instrumentMethod, noop, setTimeout } from '@datadog/browser-core'
import type { RumPublicApi, ViewOptions } from '@datadog/browser-rum-core'

export interface SalesforceLocation {
  pathname?: string
  href?: string
}

interface StartSalesforceViewNameTrackingOptions {
  getRumPublicApi: () => Pick<RumPublicApi, 'setViewName' | 'startView'> | undefined
  getLocation?: () => SalesforceLocation | undefined
}

interface SalesforceView {
  key: string
  url?: string
}

export function startSalesforceViewNameTracking(options: StartSalesforceViewNameTrackingOptions) {
  const getLocation = options.getLocation ?? getNavigationLocation
  const initialView = resolveCurrentView(getLocation())
  let lastViewKey = initialView?.key
  const eventListenerConfiguration = { allowUntrustedEvents: true }

  if (initialView) {
    setCurrentViewName(initialView)
  }

  const { stop: stopInstrumentingPushState } = instrumentMethod(
    getHistoryInstrumentationTarget('pushState'),
    'pushState',
    ({ onPostCall }) => {
      onPostCall(scheduleSetCurrentViewName)
    }
  )
  const { stop: stopInstrumentingReplaceState } = instrumentMethod(
    getHistoryInstrumentationTarget('replaceState'),
    'replaceState',
    ({ onPostCall }) => {
      onPostCall(scheduleSetCurrentViewName)
    }
  )

  const { stop: stopListeningPopState } = addEventListener(
    eventListenerConfiguration,
    window,
    DOM_EVENT.POP_STATE,
    scheduleSetCurrentViewName
  )
  const { stop: stopListeningHashChange } = addEventListener(
    eventListenerConfiguration,
    window,
    DOM_EVENT.HASH_CHANGE,
    scheduleSetCurrentViewName
  )
  const { stop: stopListeningClick } = addEventListener(
    eventListenerConfiguration,
    window,
    DOM_EVENT.CLICK,
    scheduleLocationCheckAfterClick,
    { capture: true }
  )

  function scheduleLocationCheckAfterClick() {
    setTimeout(trackCurrentView, 0)
    setTimeout(trackCurrentView, 100)
    setTimeout(trackCurrentView, 500)
  }

  function scheduleSetCurrentViewName() {
    setTimeout(trackCurrentView, 0)
  }

  function trackCurrentView() {
    const currentView = resolveCurrentView(getLocation())

    if (!currentView) {
      return
    }

    if (!lastViewKey || currentView.key === lastViewKey) {
      setCurrentViewName(currentView)
      lastViewKey = currentView.key
      return
    }

    options.getRumPublicApi()?.startView(toViewOptions(currentView))
    lastViewKey = currentView.key
  }

  function setCurrentViewName(view: SalesforceView) {
    options.getRumPublicApi()?.setViewName(view.key)
  }

  return {
    stop() {
      stopInstrumentingPushState()
      stopInstrumentingReplaceState()
      stopListeningPopState()
      stopListeningHashChange()
      stopListeningClick()
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
    return normalizePathname(buildUrl(href).pathname)
  } catch {
    return undefined
  }
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

function getHistoryInstrumentationTarget(methodName: 'pushState' | 'replaceState') {
  if (typeof History === 'undefined') {
    return { [methodName]: noop }
  }

  return Object.prototype.hasOwnProperty.call(history, methodName) ? history : History.prototype
}
