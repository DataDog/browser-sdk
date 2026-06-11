/**
 * Workaround for Vitest browser mode websocket idle timeout on BrowserStack.
 *
 * BrowserStack drops idle websocket connections after ~60s. Vitest's orchestrator
 * websocket has no heartbeat, so it gets reaped during long-running tests.
 * This keepalive pings the RPC channel every 25s to prevent the drop.
 *
 * See https://github.com/vitest-dev/vitest/issues/10151
 */
// @ts-expect-error -- @vitest/browser/client has no type declarations
const { client } = await import('@vitest/browser/client')

const KEEPALIVE_INTERVAL_MS = 25_000
let keepAliveInFlight = false

async function sendKeepAlive(): Promise<void> {
  if (keepAliveInFlight) {
    return
  }

  keepAliveInFlight = true

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await client.waitForConnection()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await client.rpc.getCountOfFailedTests()
  } catch {
    // ignore transient reconnects
  } finally {
    keepAliveInFlight = false
  }
}

const timerId = window.setInterval(() => {
  void sendKeepAlive()
}, KEEPALIVE_INTERVAL_MS)

window.addEventListener(
  'pagehide',
  () => {
    window.clearInterval(timerId)
  },
  { once: true }
)
