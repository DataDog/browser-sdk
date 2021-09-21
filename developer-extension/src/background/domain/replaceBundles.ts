import { listenAction } from '../actions'
import { DEV_LOGS_URL, DEV_RUM_SLIM_URL, DEV_RUM_URL } from '../constants'
import { setStore, store } from '../store'

chrome.webRequest.onBeforeRequest.addListener(
  (info) => {
    if (store.useDevBundles) {
      const url = new URL(info.url)
      if (url.pathname.includes('logs')) {
        return { redirectUrl: DEV_LOGS_URL }
      }
      if (url.pathname.includes('rum')) {
        return {
          redirectUrl: store.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL,
        }
      }
    } else if (store.useRumSlim && /\/datadog-rum(?!-slim)/.test(info.url)) {
      return {
        redirectUrl: info.url.replace(/datadog-rum/, 'datadog-rum-slim'),
      }
    }
    return
  },
  {
    types: ['script'],
    urls: [
      ...getBundleUrlPatterns('logs'),
      ...getBundleUrlPatterns('rum'),
      ...getBundleUrlPatterns('rum-slim'),
      'https://localhost:8443/static/datadog-rum-hotdog.js',
    ],
  },
  ['blocking']
)

listenAction('getStore', () => {
  refreshDevServerStatus().catch((error) =>
    console.error('Unexpected error while refreshing dev server status:', error)
  )
})

listenAction('setStore', (newStore) => {
  if ('useDevBundles' in newStore || 'useRumSlim' in newStore) {
    chrome.browsingData.removeCache({})
  }
})

function getBundleUrlPatterns(bundleName: string) {
  return [
    `https://*/datadog-${bundleName}.js`,
    `https://*/datadog-${bundleName}-v3.js`,
    `https://*/datadog-${bundleName}-canary.js`,
    `https://*/datadog-${bundleName}-head.js`,
  ]
}

async function refreshDevServerStatus() {
  const timeoutId = setTimeout(() => setStore({ devServerStatus: 'checking' }), 500)
  let isAvailable = false
  try {
    const response = await fetch(DEV_LOGS_URL, { method: 'HEAD' })
    isAvailable = response.status === 200
  } catch {
    // The request can fail if nothing is listening on the URL port. In this case, consider the dev
    // server 'unavailable'.
  }
  clearTimeout(timeoutId)
  setStore({ devServerStatus: isAvailable ? 'available' : 'unavailable' })
}
