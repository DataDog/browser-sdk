import type { Page } from '@playwright/test'
import { waitForServersIdle } from './httpServers'

/**
 * Wait for browser requests to be sent and finished.
 *
 * Due to latency, a request (fetch, xhr, sendBeacon...) started inside a `browser.execute(...)`
 * callback might *not* have reached the local server when `browser.execute` finishes. Thus, calling
 * `waitForServersIdle()` directly might be flaky, because no request might be pending yet.
 *
 * The SDK also defers some bookkeeping (notably resource event emission) onto an idle-callback
 * task queue, so we drain it explicitly via two `requestIdleCallback` round-trips before letting
 * the test assert on captured events.
 */
export async function waitForRequests(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        // Drain the SDK's idle-callback task queue (used to defer resource event emission) before
        // letting the test assert on captured events. Two passes ensure tasks enqueued by the
        // first batch of tasks are also processed. A 500ms watchdog covers pages where
        // requestIdleCallback is throttled or unavailable (e.g. the empty /flush page during
        // teardown).
        setTimeout(resolve, 500)
        const ric = window.requestIdleCallback?.bind(window) ?? ((cb: IdleRequestCallback) => setTimeout(cb, 50))
        ric(() => ric(() => setTimeout(resolve, 0)))
      })
  )
  await waitForServersIdle()
}
