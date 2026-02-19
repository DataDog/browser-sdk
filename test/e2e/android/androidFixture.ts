import { test as base } from '@playwright/test'
import { _android } from 'playwright'

const DEVICE_CONNECTION_TIMEOUT = 30_000
const DEVICE_CONNECTION_RETRY_INTERVAL = 2_000

export const test = base.extend<{ context: Awaited<ReturnType<typeof connectDevice>> }>({
  context: async (_, use) => {
    const device = await connectDevice()
    const context = await device.launchBrowser()
    await use(context)
    await context.close()
    await device.close()
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
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
