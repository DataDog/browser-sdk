import type { Page } from '@playwright/test'
import { getTestServers, waitForServersIdle } from './httpServers'
import { waitForRequests } from './waitForRequests'

export async function flushEvents(page: Page) {
  await waitForRequests(page)
  const servers = await getTestServers()

  const pageUrl = new URL(page.url())

  // In WebKit, `beforeunload` doesn't always fire when navigating cross-domain (see table below).
  // This causes flush to fail for tests that change the hostname via `withHostName()`.
  // Workaround: use /flush on the same origin when already on the base server.
  //
  // Revisit if:
  // * the SDK becomes more reliable about flushing across domain navigations
  // * or E2E tests stop mixing IP addresses and localhost domains
  //
  // In webkit, beforeunload fires in the following cases:
  // ┌─────────────────────────────────┬─────────────────────┐
  // │           Navigation            │ beforeunload fires? │
  // ├─────────────────────────────────┼─────────────────────┤
  // │ localhost:3000 ↔ localhost:3001 │ yes                 │
  // ├─────────────────────────────────┼─────────────────────┤
  // │ foo.localhost → localhost       │ yes                 │
  // ├─────────────────────────────────┼─────────────────────┤
  // │ localhost → foo.localhost       │ no                  │
  // ├─────────────────────────────────┼─────────────────────┤
  // │ localhost ↔ 127.0.0.1           │ no                  │
  // └─────────────────────────────────┴─────────────────────┘
  const isOnBaseServer = pageUrl.port === new URL(servers.base.origin).port
  const flushOrigin = isOnBaseServer ? pageUrl.origin : servers.base.origin

  await Promise.all([waitForServersIdle(), page.goto(new URL('/flush', flushOrigin).href)])
}
