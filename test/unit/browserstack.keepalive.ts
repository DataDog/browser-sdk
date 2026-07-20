import { client } from '@vitest/browser/client'

const KEEPALIVE_INTERVAL = 25_000
const keepaliveWindow = window as Window & { vitestBrowserStackKeepalive?: number }

if (keepaliveWindow.vitestBrowserStackKeepalive === undefined) {
  let keepaliveInFlight = false

  const sendKeepalive = async () => {
    if (keepaliveInFlight) {
      return
    }

    keepaliveInFlight = true
    try {
      await client.waitForConnection()
      await client.rpc.getCountOfFailedTests()
    } catch {
      // A transient reconnect can race with the heartbeat; the next interval retries it.
    } finally {
      keepaliveInFlight = false
    }
  }

  keepaliveWindow.vitestBrowserStackKeepalive = window.setInterval(() => {
    void sendKeepalive()
  }, KEEPALIVE_INTERVAL)

  window.addEventListener(
    'pagehide',
    () => {
      window.clearInterval(keepaliveWindow.vitestBrowserStackKeepalive)
      delete keepaliveWindow.vitestBrowserStackKeepalive
    },
    { once: true }
  )
}
