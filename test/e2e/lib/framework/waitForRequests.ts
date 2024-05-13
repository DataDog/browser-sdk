import { waitForServersIdle } from './httpServers'

/**
 * Wait for browser requests to be sent and finished.
 *
 * Due to latency, a request (fetch, xhr, sendBeacon...) started inside a `browser.execute(...)`
 * callback might *not* have reached the local server when `browser.execute` finishes. Thus, calling
 * `waitForServersIdle()` directly might be flaky, because no request might be pending yet.
 *
 * As a workaround, this function delays the `waitForServersIdle()` call by doing a browser
 * roundtrip, ensuring requests have plenty of time to reach the local server.
 */
export async function waitForRequests() {
  await browser.executeAsync((done) =>
    setTimeout(() => {
      done(undefined)
    }, 200)
  )
  await waitForServersIdle()
}
