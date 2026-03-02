import type { BrowserContext } from '@playwright/test'
import { test as base } from '@playwright/test'
import type { AndroidDevice } from 'playwright'
import { _android } from 'playwright'

const DEVICE_CONNECTION_TIMEOUT = 30_000
const DEVICE_CONNECTION_RETRY_INTERVAL = 2_000

let cachedDevice: AndroidDevice | undefined
let cachedContext: BrowserContext | undefined

async function getOrCreateContext(): Promise<{ device: AndroidDevice; context: BrowserContext }> {
  if (cachedDevice && cachedContext) {
    try {
      // Verify the context is still alive by attempting a simple operation
      await cachedContext.pages()
      return { device: cachedDevice, context: cachedContext }
    } catch {
      // Context is stale, recreate
      cachedContext = undefined
    }
  }

  if (!cachedDevice) {
    cachedDevice = await connectDevice()
  }

  // Use Chromium (org.chromium.chrome) instead of the outdated system Chrome (v113)
  cachedContext = await cachedDevice.launchBrowser({ pkg: 'org.chromium.chrome' })
  return { device: cachedDevice, context: cachedContext }
}

export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const { context } = await getOrCreateContext()
    await use(context)
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    // Clean up service workers before closing the page to prevent stale SW state
    // from interfering with subsequent tests in the shared browser context
    try {
      await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      })
    } catch {
      // Page might already be in a bad state, ignore cleanup errors
    }
    await page.close()
  },
})

async function connectDevice() {
  const startTime = Date.now()

  while (Date.now() - startTime < DEVICE_CONNECTION_TIMEOUT) {
    const devices = await _android.devices()
    if (devices.length > 0) {
      return devices[0]
    }
    await new Promise((resolve) => setTimeout(resolve, DEVICE_CONNECTION_RETRY_INTERVAL))
  }

  throw new Error(`No Android device found within ${DEVICE_CONNECTION_TIMEOUT / 1000}s`)
}

export { expect } from '@playwright/test'
