import type { BrowserContext } from '@playwright/test'
import { test as base } from '@playwright/test'
import type { AndroidDevice } from 'playwright'

const WEBVIEW_PKG = 'com.example.webviewtest'
const WEBVIEW_ACTIVITY = `${WEBVIEW_PKG}/.MainActivity`
const DEVICE_CONNECTION_TIMEOUT = 30_000
const DEVICE_CONNECTION_RETRY_INTERVAL = 2_000

let cachedDevice: AndroidDevice | undefined

async function getDevice(): Promise<AndroidDevice> {
  if (cachedDevice) {
    return cachedDevice
  }

  const { _android } = await import('playwright')
  const startTime = Date.now()

  while (Date.now() - startTime < DEVICE_CONNECTION_TIMEOUT) {
    const devices = await _android.devices()
    if (devices.length > 0) {
      cachedDevice = devices[0]
      return cachedDevice
    }
    await new Promise((resolve) => setTimeout(resolve, DEVICE_CONNECTION_RETRY_INTERVAL))
  }

  throw new Error(`No Android device found within ${DEVICE_CONNECTION_TIMEOUT / 1000}s`)
}

/**
 * Playwright fixture that provides a Page inside an Android WebView.
 *
 * Launches the minimal WebView test app (com.example.webviewtest) and connects
 * to its WebView via Playwright's experimental Android WebView API. The page
 * object works like a regular Playwright Page.
 */
export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const device = await getDevice()

    await device.shell(`am force-stop ${WEBVIEW_PKG}`)
    await device.shell(`am start -n ${WEBVIEW_ACTIVITY} --es url "about:blank"`)

    // Wait for the WebView to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const webview = await device.webView({ pkg: WEBVIEW_PKG })
    const page = await webview.page()
    const context = page.context()

    await use(context)

    await device.shell(`am force-stop ${WEBVIEW_PKG}`)
  },
  page: async ({ context }, use) => {
    // The WebView has exactly one page already open — use it directly.
    // Do NOT call context.newPage() as WebView contexts don't support multiple pages.
    const page = context.pages()[0]
    await use(page)
  },
})

export { expect } from '@playwright/test'
