import path from 'path'
import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'

const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '../../../../testing-extensions')
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
    })
    await use(context)
    await context.close()
  },
  // eslint-disable-next-line no-empty-pattern
  extensionId: async ({}, use) => {
    // Use the known extension ID to avoid waiting for background/service worker events.
    await use('onknnkkjabakplhdagapdhegichdcphj')
  },
})

// ─── FUNCTIONS UNDER TEST ──────────────────────────────────────────────────
export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

/**
 * Utility function to detect if the current environment is a browser extension
 * @returns {boolean} true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(): boolean {
  const errorStack = new Error().stack || ''
  const windowLocation = window.location.href || ''
  return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack)
}

// ─── TESTS ─────────────────────────────────────────────────────────────────
test.describe('Extension Environment Tests', () => {
  test('popup page should load extension popup and display expected content', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    await expect(page.locator('body')).toHaveText(/Extension/)
  })

  test('isUnsupportedExtensionEnvironment returns false in real extension environment', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    const result = await page.evaluate(() => {
      function containsExtensionUrl(str: string): boolean {
        return ['chrome-extension://', 'moz-extension://', 'safari-extension://'].some((prefix) => str.includes(prefix))
      }
      function isUnsupportedExtensionEnvironment(): boolean {
        const errorStack = new Error().stack || ''
        const windowLocation = window.location.href || ''
        return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack)
      }
      return isUnsupportedExtensionEnvironment()
    })
    expect(result).toBe(false)
  })

  test('isUnsupportedExtensionEnvironment returns false in normal environment with no extension in error stack', async ({
    page,
  }) => {
    await page.goto('https://example.com')
    const result = await page.evaluate(() => {
      function containsExtensionUrl(str: string): boolean {
        return ['chrome-extension://', 'moz-extension://', 'safari-extension://'].some((prefix) => str.includes(prefix))
      }
      function isUnsupportedExtensionEnvironment(): boolean {
        const errorStack = new Error().stack || ''
        const windowLocation = window.location.href || ''
        return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack)
      }
      const originalStackDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack')
      Object.defineProperty(Error.prototype, 'stack', {
        configurable: true,
        get() {
          return 'Error: test\n    at https://example.com/script.js:1:1'
        },
      })
      const res = isUnsupportedExtensionEnvironment()
      if (originalStackDescriptor) {
        Object.defineProperty(Error.prototype, 'stack', originalStackDescriptor)
      }
      return res
    })
    expect(result).toBe(false)
  })

  test('isUnsupportedExtensionEnvironment returns true in normal environment with forged extension error stack', async ({
    page,
  }) => {
    await page.goto('https://example.com')
    const result = await page.evaluate(() => {
      function containsExtensionUrl(str: string): boolean {
        return ['chrome-extension://', 'moz-extension://', 'safari-extension://'].some((prefix) => str.includes(prefix))
      }
      function isUnsupportedExtensionEnvironment(): boolean {
        const errorStack = new Error().stack || ''
        const windowLocation = window.location.href || ''
        return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack)
      }
      const originalStackDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack')
      Object.defineProperty(Error.prototype, 'stack', {
        configurable: true,
        get() {
          return 'Error: test\n    at chrome-extension://dummy-extension-id/background.js:1:1'
        },
      })
      const res = isUnsupportedExtensionEnvironment()
      if (originalStackDescriptor) {
        Object.defineProperty(Error.prototype, 'stack', originalStackDescriptor)
      }
      return res
    })
    expect(result).toBe(true)
  })

  test('containsExtensionUrl works correctly', () => {
    expect(containsExtensionUrl('chrome-extension://dummy/route')).toBe(true)
    expect(containsExtensionUrl('moz-extension://dummy/route')).toBe(true)
    expect(containsExtensionUrl('safari-extension://dummy/route')).toBe(true)
    expect(containsExtensionUrl('https://example.com')).toBe(false)
  })
})
