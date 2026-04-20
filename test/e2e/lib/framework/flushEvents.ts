import type { Page } from '@playwright/test'
import { getTestServers, waitForServersIdle } from './httpServers'
import { waitForRequests } from './waitForRequests'

export async function flushEvents(page: Page) {
  await waitForRequests(page)
  const servers = await getTestServers()
  await Promise.all([waitForServersIdle(), page.goto(`${servers.base.origin}/flush`)])
}
