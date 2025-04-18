import path from 'path'
import { expect } from '@playwright/test'
import { createExtensionTest } from '../utils/extensionFixture'
import { DEFAULT_RUM_CONFIGURATION } from '../../lib/framework'

const pathToExtension = path.join(__dirname, '../../../../test/apps/extension')
const test = createExtensionTest(pathToExtension)

test.describe('Extension Environment Tests', () => {
  test('popup page should load extension popup and display expected content', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    await expect(page.locator('body')).toHaveText(/Extension Popup/)
  })

  test('SDK is initialized in an unsupported environment', async ({ page, extensionId }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    const extensionResult = await page.evaluate(
      () =>
        window.DD_RUM?.getInitConfiguration() ?? {
          applicationId: '',
        }
    )
    expect(extensionResult.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)

    await page.goto('https://www.datadoghq.com/')
    const regularResult = await page.evaluate(
      () =>
        window.DD_RUM?.getInitConfiguration() ?? {
          applicationId: '',
        }
    )
    expect(regularResult.applicationId).not.toBe(DEFAULT_RUM_CONFIGURATION.applicationId)

    expect(consoleMessages).toContain(
      'Datadog Browser SDK: SDK is being initialized from an extension. This is not supported for now.'
    )
  })

  test('SDK is initialized in a supported environment', async ({ page, extensionId }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
    const extensionResult = await page.evaluate(
      () =>
        window.DD_RUM?.getInitConfiguration() ?? {
          applicationId: '',
        }
    )
    expect(extensionResult.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)

    await page.goto('https://developer.chrome.com/docs/extensions/reference/api/printing')
    const regularResult = await page.evaluate(() => window.DD_RUM)
    expect(regularResult).toBeUndefined()

    expect(consoleMessages).toContain(
      'Datadog Browser SDK: SDK is being initialized from an extension. This is not supported for now.'
    )
  })
})
