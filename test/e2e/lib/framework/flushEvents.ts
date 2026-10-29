import type { Page } from '@playwright/test'
import { getTestServers, waitForServersIdle } from './httpServers'
import { waitForRequests } from './waitForRequests'

export async function flushEvents(page: Page) {
  await waitForRequests(page)
  const servers = await getTestServers()

  const pageUrl = new URL(page.url())

  // The SDK sends its last batches when the page exits, so flush by navigating to /flush.
  // * Origin: stay on the page origin when it is served by the base server, since exit events are
  //   most reliable on same-origin navigations (WebKit has skipped them on some cross-site ones,
  //   e.g. localhost ↔ IP). Framework apps (Nuxt, Next.js…) don't serve /flush: use the base server.
  // * Navigation: start it from within the page, like a user clicking a link. WebKit doesn't fire
  //   `beforeunload` on `page.goto()`, so the SDK would only flush on `pagehide`, after /flush responds.
  const isOnBaseServer = pageUrl.port === new URL(servers.base.origin).port
  const flushOrigin = isOnBaseServer ? pageUrl.origin : servers.base.origin
  const flushUrl = new URL('/flush', flushOrigin).href

  await Promise.all([
    waitForServersIdle(),
    page
      .evaluate((url) => {
        window.location.href = url
      }, flushUrl)
      .then(() => page.waitForURL(flushUrl)),
  ])
}
