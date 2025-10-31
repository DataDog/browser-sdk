import type { CDPSession } from '@playwright/test'
import type { Protocol } from 'playwright-core/types/protocol'

export async function startNetworkProfiling(client: CDPSession) {
  await client.send('Network.enable')
  let downloadBytes = 0
  let uploadBytes = 0

  const requestListener = ({ request }: Protocol.Network.requestWillBeSentPayload) => {
    const postData = request.postData
    if (postData) {
      if (request.headers['accept-encoding']?.includes('deflate')) {
        uploadBytes += postData.length
      } else {
        uploadBytes += new TextEncoder().encode(postData).length
      }
    }
  }

  const loadingFinishedListener = ({ encodedDataLength }: Protocol.Network.loadingFinishedPayload) => {
    downloadBytes += encodedDataLength
  }

  client.on('Network.requestWillBeSent', requestListener)
  client.on('Network.loadingFinished', loadingFinishedListener)

  return {
    stopNetworkProfiling: () => {
      client.off('Network.requestWillBeSent', requestListener)
      client.off('Network.loadingFinished', loadingFinishedListener)

      return {
        upload: uploadBytes,
        download: downloadBytes,
      }
    },
  }
}
