import type { Page, Request } from '@playwright/test'

export function startNetworkProfiling(page: Page) {
  let uploadBytes = 0
  let downloadBytes = 0

  async function onRequestFinished(request: Request) {
    const sizes = await request.sizes()
    downloadBytes += sizes.responseBodySize + sizes.responseHeadersSize
    uploadBytes += sizes.requestBodySize + sizes.requestHeadersSize
  }

  page.on('requestfinished', onRequestFinished)

  return {
    stopNetworkProfiling: () => {
      page.off('requestfinished', onRequestFinished)
      return {
        upload: uploadBytes,
        download: downloadBytes,
      }
    },
  }
}
