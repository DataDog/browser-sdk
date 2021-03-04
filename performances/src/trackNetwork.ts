import { HTTPRequest, Page } from 'puppeteer'

export function trackNetwork(page: Page) {
  const pendingRequests = new Set<HTTPRequest>()

  page.on('request', (request) => {
    pendingRequests.add(request)
  })
  page.on('requestfailed', (request) => {
    pendingRequests.delete(request)
  })
  page.on('requestfinished', (request) => {
    pendingRequests.delete(request)
  })

  return {
    waitForNetworkIdle: async () =>
      new Promise<void>((resolve) => {
        let timeoutId: NodeJS.Timeout

        wake()

        page.on('request', wake)
        page.on('requestfinished', wake)
        page.on('requestfailed', wake)

        function wake() {
          clearTimeout(timeoutId)
          if (pendingRequests.size === 0) {
            timeoutId = setTimeout(() => {
              page.off('request', wake)
              page.off('requestfinished', wake)
              page.off('requestfailed', wake)
              resolve()
            }, 200)
          }
        }
      }),
  }
}
