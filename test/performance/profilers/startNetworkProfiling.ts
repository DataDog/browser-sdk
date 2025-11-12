import type { Page } from '@playwright/test'

export function startNetworkProfiling(page: Page) {
  let uploadBytes = 0
  let downloadBytes = 0

  page.on('requestfinished', async (request) => {
    const sizes = await request.sizes()
    downloadBytes += sizes.responseBodySize + sizes.responseHeadersSize
    uploadBytes += sizes.requestBodySize + sizes.requestHeadersSize
  })

  return {
    stopNetworkProfiling: () => ({
      upload: uploadBytes,
      download: downloadBytes,
    }),
  }
}
