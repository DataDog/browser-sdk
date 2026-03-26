import type { BrowserContext } from '@playwright/test'
import { test as base } from '@playwright/test'
import type { AndroidDevice } from 'playwright'

const DEVICE_CONNECTION_TIMEOUT = 30_000
const DEVICE_CONNECTION_RETRY_INTERVAL = 2_000

let cachedDevice: AndroidDevice | undefined
let cachedContext: BrowserContext | undefined

async function getOrCreateContext(): Promise<{ device: AndroidDevice; context: BrowserContext }> {
  if (cachedDevice && cachedContext) {
    try {
      cachedContext.pages()
      return { device: cachedDevice, context: cachedContext }
    } catch {
      cachedContext = undefined
    }
  }

  if (!cachedDevice) {
    cachedDevice = await connectDevice()
  }

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
    // Unregister service workers to prevent stale state across tests
    try {
      await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      })
    } catch {
      // ignore
    }
    await page.close()
  },
})

async function connectDevice() {
  const { _android } = await import('playwright')
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
