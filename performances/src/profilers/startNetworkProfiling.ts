import type { CDPSession, Protocol } from 'puppeteer'
import type { ProfilingOptions } from '../types'
import { isSdkBundleUrl } from '../utils'

export async function startNetworkProfiling(options: ProfilingOptions, client: CDPSession) {
  await client.send('Network.enable')
  options.proxy.stats.reset()
  // Twitter is using a service worker intercepting our requests
  await client.send('Network.setBypassServiceWorker', { bypass: true })
  let sdkDownload = 0

  const sdkRequestIds = new Set<string>()

  const requestListener = ({ request, requestId }: Protocol.Network.RequestWillBeSentEvent) => {
    if (isSdkBundleUrl(options, request.url)) {
      sdkRequestIds.add(requestId)
    }
  }

  const loadingFinishedListener = ({ requestId, encodedDataLength }: Protocol.Network.LoadingFinishedEvent) => {
    if (sdkRequestIds.has(requestId)) {
      sdkDownload += encodedDataLength
    }
  }

  client.on('Network.requestWillBeSent', requestListener)
  client.on('Network.loadingFinished', loadingFinishedListener)
  return () => {
    client.off('Network.requestWillBeSent', requestListener)
    client.off('Network.loadingFinishedListener', loadingFinishedListener)

    return {
      upload: options.proxy.stats.getStatsByHost(),
      download: sdkDownload,
    }
  }
}
