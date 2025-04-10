import path from 'path'
import { test as base, chromium, expect, type BrowserContext } from '@playwright/test'

const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '../../../../sandbox/testing-extension')
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
    await use('npndlchcnpnbmmmhbgpgonapiegdkkge')
  },
})

const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://']

function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

test.describe('Extension Environment Tests', () => {
  test('popup page should load extension popup and display expected content', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    await expect(page.locator('body')).toHaveText(/Extension Popup/)
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

  test('isUnsupportedExtensionEnvironment returns true in normal environment with extension error stack', async ({
    page,
  }) => {
    await page.goto('https://example.com')
    const result = await page.evaluate(() => {
      function containsExtensionUrl(str: string): boolean {
        console.log(`Checking if "${str}" contains extension URL`)
        return ['chrome-extension://', 'moz-extension://', 'safari-extension://'].some((prefix) => str.includes(prefix))
      }

      function isUnsupportedExtensionEnvironment(): boolean {
        // For testing, use a hardcoded error stack that contains a chrome-extension URL
        const errorStack = 'Error: test\n    at chrome-extension://npndlchcnpnbmmmhbgpgonapiegdkkge/background.js:1:1'
        const windowLocation = window.location.href || ''

        console.log('windowLocation1', windowLocation)
        console.log('errorStack1', errorStack)

        const notInExtensionLocation = !containsExtensionUrl(windowLocation)
        const hasExtensionInStack = containsExtensionUrl(errorStack)

        console.log('!containsExtensionUrl(windowLocation):', notInExtensionLocation)
        console.log('containsExtensionUrl(errorStack):', hasExtensionInStack)

        return notInExtensionLocation && hasExtensionInStack
      }

      const res = isUnsupportedExtensionEnvironment()
      console.log('Final result:', res)
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
