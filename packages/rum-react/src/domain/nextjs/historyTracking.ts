import { buildUrl, addEventListener, instrumentMethod, DOM_EVENT } from '@datadog/browser-core'

type NavigationCallback = (pathname: string) => void

/**
 * Sets up History API interception to track client-side navigations.
 * This is needed so that we can track navigations and not have race conditions with the browser.
 *
 * @param onNavigation - Callback invoked with the new pathname on each navigation
 * @returns Object with a `stop` method to remove interception and event listeners
 */
export function setupHistoryTracking(onNavigation: NavigationCallback): () => void {
  function handleStateChange(_state: unknown, _unused: string, url?: string | URL | null) {
    if (url) {
      const pathname = buildUrl(String(url), window.location.href).pathname
      onNavigation(pathname)
    }
  }

  function handlePopState() {
    onNavigation(window.location.pathname)
  }

  const { stop: stopInstrumentingPushState } = instrumentMethod(
    getHistoryInstrumentationTarget('pushState'),
    'pushState',
    ({ parameters, onPostCall }) => {
      onPostCall(() => handleStateChange(...parameters))
    }
  )

  const { stop: stopInstrumentingReplaceState } = instrumentMethod(
    getHistoryInstrumentationTarget('replaceState'),
    'replaceState',
    ({ parameters, onPostCall }) => {
      onPostCall(() => handleStateChange(...parameters))
    }
  )

  const { stop: stopPopStateListener } = addEventListener(
    { allowUntrustedEvents: true },
    window,
    DOM_EVENT.POP_STATE,
    handlePopState
  )

  return () => {
    stopInstrumentingPushState()
    stopInstrumentingReplaceState()
    stopPopStateListener()
  }
}

function getHistoryInstrumentationTarget(methodName: 'pushState' | 'replaceState') {
  return Object.prototype.hasOwnProperty.call(history, methodName) ? history : History.prototype
}
