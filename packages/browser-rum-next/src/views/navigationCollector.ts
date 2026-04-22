import type { Pipeline } from '@datadog/core-next'
import type { NavigationResource, ViewLoadingType } from './types'

function hasViewChanged(currentHref: string, newHref: string): boolean {
  try {
    const current = new URL(currentHref)
    const next = new URL(newHref)
    if (current.pathname !== next.pathname) return true
    // Treat hash-based routing (#/path) as a view change
    const currentHashPath = current.hash.startsWith('#/') ? current.hash : ''
    const nextHashPath = next.hash.startsWith('#/') ? next.hash : ''
    return currentHashPath !== nextHashPath
  } catch {
    return currentHref !== newHref
  }
}

function startNavigationCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  let currentUrl = window.location.href

  function publishNavigation(loadingType: ViewLoadingType, startTime: number, startDate: number): void {
    const newUrl = window.location.href
    const resource: NavigationResource = {
      url: newUrl,
      startTime,
      startDate,
      referrer: currentUrl,
      loadingType,
    }
    currentUrl = newUrl
    pipeline.publish('resource:navigation', resource)
  }

  // Patch pushState
  const originalPushState = history.pushState
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const startTime = performance.now()
    const startDate = Date.now()
    originalPushState.apply(history, args)
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', startTime, startDate)
    }
  }

  // Patch replaceState
  const originalReplaceState = history.replaceState
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const startTime = performance.now()
    const startDate = Date.now()
    originalReplaceState.apply(history, args)
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', startTime, startDate)
    }
  }

  // Listen to popstate (back/forward navigation)
  const handlePopstate = () => {
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', performance.now(), Date.now())
    }
  }

  // Listen to hashchange (hash-only routing)
  const handleHashchange = () => {
    if (hasViewChanged(currentUrl, window.location.href)) {
      publishNavigation('route_change', performance.now(), Date.now())
    }
  }

  // Listen to pageshow for BFCache restore
  const handlePageshow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      publishNavigation('bf_cache', performance.now(), Date.now())
    }
  }

  window.addEventListener('popstate', handlePopstate)
  window.addEventListener('hashchange', handleHashchange)
  window.addEventListener('pageshow', handlePageshow)

  return () => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
    window.removeEventListener('popstate', handlePopstate)
    window.removeEventListener('hashchange', handleHashchange)
    window.removeEventListener('pageshow', handlePageshow)
  }
}

export { startNavigationCollection, hasViewChanged }
