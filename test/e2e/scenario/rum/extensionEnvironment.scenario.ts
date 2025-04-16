import path from 'path'
import { type BrowserContext, chromium, expect, test as base } from '@playwright/test'

const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'chromium', 'Extension tests only run in Chromium')

    const pathToExtension = path.join(__dirname, '../../../../test/apps/extension')
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    const workers = context.serviceWorkers()
    const extensionId = workers[0]?.url().split('/')[2]
    if (!extensionId) {
      const worker = await context.waitForEvent('serviceworker')
      const id = worker.url().split('/')[2]
      await use(id)
    } else {
      await use(extensionId)
    }
  },
})

test.describe('Extension Environment Tests', () => {
  test('popup page should load extension popup and display expected content', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    await expect(page.locator('body')).toHaveText(/Extension Popup/)
  })

  test('SDK is initialized in an unsupported environment', async ({ page, extensionId }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    const extensionResult = await page.evaluate(() => (window.DD_RUM ? window.DD_RUM.version : ''))
    expect(extensionResult).toBe('dev')

    await page.goto('https://www.datadoghq.com/')
    const regularResult = await page.evaluate(() => (window.DD_RUM ? window.DD_RUM.version : ''))
    expect(regularResult).not.toBe('')

    expect(consoleMessages).toContain('Datadog Browser SDK: DD_RUM is already initialized.')
  })

  test('SDK is initialized in a supported environment', async ({ page, extensionId }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    const extensionResult = await page.evaluate(() => (window.DD_RUM ? window.DD_RUM.version : ''))
    expect(extensionResult).toBe('dev')

    await page.goto('http://localhost:8080/')
    const regularResult = await page.evaluate(() => (window.DD_RUM ? window.DD_RUM.version : ''))
    expect(regularResult).not.toBe('')

    expect(consoleMessages).toContain('Extension context DD_RUM.version: dev')
  })
})
