import type { HTTPRequest, Page } from 'puppeteer'

// Arbitrary maximum time to wait for a request, to make sure `waitForNetworkIdle` does not block
// for too long.
const REQUEST_TIMEOUT = 5000 // 5 seconds

export function trackNetwork(page: Page) {
  const pendingRequests = new Map<HTTPRequest, number>()

  page.on('request', (request) => {
    pendingRequests.set(request, Date.now())
  })
  page.on('requestfailed', (request) => {
    pendingRequests.delete(request)
  })
  page.on('requestfinished', (request) => {
    pendingRequests.delete(request)
  })
  page.on('response', (response) => {
    pendingRequests.delete(response.request())
  })

  return {
    waitForNetworkIdle: async () =>
      new Promise<void>((resolve) => {
        let timeoutId: NodeJS.Timeout
        const periodicalWakeIntervalId = setInterval(wake, REQUEST_TIMEOUT)

        wake()

        page.on('request', wake)
        page.on('requestfinished', wake)
        page.on('requestfailed', wake)
        page.on('response', wake)

        function wake() {
          clearTimeout(timeoutId)

          const now = Date.now()
          pendingRequests.forEach((start, request) => {
            if (start < now - REQUEST_TIMEOUT) {
              pendingRequests.delete(request)
            }
          })

          if (pendingRequests.size === 0) {
            clearInterval(periodicalWakeIntervalId)
            timeoutId = setTimeout(() => {
              page.off('request', wake)
              page.off('requestfinished', wake)
              page.off('requestfailed', wake)
              page.off('response', wake)
              resolve()
            }, 200)
          }
        }
      }),
  }
}
