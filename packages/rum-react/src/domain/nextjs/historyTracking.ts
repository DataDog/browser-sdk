import { buildUrl, addEventListener, DOM_EVENT } from '@datadog/browser-core'

type NavigationCallback = (pathname: string) => void

/**
 * Sets up History API interception to track client-side navigations.
 *
 * @param onNavigation - Callback invoked with the new pathname on each navigation
 * @returns Cleanup function to remove interception and event listeners
 */
export function setupHistoryTracking(onNavigation: NavigationCallback): () => void {
  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  function handleStateChange(_state: unknown, _unused: string, url?: string | URL | null) {
    if (url) {
      const pathname = buildUrl(String(url), window.location.href).pathname
      onNavigation(pathname)
    }
  }

  function handlePopState() {
    onNavigation(window.location.pathname)
  }

  // Intercept pushState
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const result = originalPushState(...args)
    handleStateChange(...args)
    return result
  }

  // Intercept replaceState
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const result = originalReplaceState(...args)
    handleStateChange(...args)
    return result
  }

  // Listen for back/forward navigation
  const { stop: stopPopStateListener } = addEventListener(
    { allowUntrustedEvents: true },
    window,
    DOM_EVENT.POP_STATE,
    handlePopState
  )

  // Return cleanup function
  return () => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
    stopPopStateListener()
  }
}
