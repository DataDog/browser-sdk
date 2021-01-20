import { listenAction } from '../actions'
import { DEV_LOGS_URL, DEV_RUM_RECORDER_URL, DEV_RUM_URL } from '../constants'
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
          redirectUrl: store.useRumRecorder ? DEV_RUM_RECORDER_URL : DEV_RUM_URL,
        }
      }
    } else if (store.useRumRecorder && /\/datadog-rum(?!-recorder)\.js$/.test(info.url)) {
      return {
        redirectUrl: info.url.replace(/\.js$/, '-recorder.js'),
      }
    }
    return
  },
  {
    types: ['script'],
    urls: [
      // TODO: implement a configuration page to add more URLs in this list.
      'https://www.datadoghq-browser-agent.com/datadog-logs.js',
      'https://www.datadoghq-browser-agent.com/datadog-rum.js',
      'https://www.datadoghq-browser-agent.com/datadog-rum-recorder.js',
      'https://localhost:8443/static/datadog-rum-hotdog.js',
    ],
  },
  ['blocking']
)

listenAction('getStore', () => refreshDevServerStatus())

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
