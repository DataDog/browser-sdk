import path from 'path'
import { test, expect } from '@playwright/test'
import { DEFAULT_RUM_CONFIGURATION, createTest } from '../../lib/framework'

// Different extension build paths for different configurations
const pathToDefaultExtension = path.join(__dirname, '../../../../test/apps/extensions/base')
// Contains allowedTrackingOrigins parameter with chrome-extension origin
const pathToChromeExtension = path.join(__dirname, '../../../../test/apps/extensions/allowed-tracking-origin')
// Contains allowedTrackingOrigins parameter with app.example.com origin
const pathToExampleExtension = path.join(__dirname, '../../../../test/apps/extensions/invalid-tracking-origin')

test.describe('browser extensions', () => {
  console.log('test')
  createTest('popup page should load extension popup and display expected content')
    .withExtension(pathToDefaultExtension)
    .run(async ({ page, extensionId }) => {
      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
      await expect(page.locator('body')).toHaveText(/Extension Popup/)
    })

  createTest(
    'SDK is initialized in an unsupported environment without allowedTrackingOrigins and warns when used in content script'
  )
    .withExtension(pathToDefaultExtension)
    .withRum()
    .run(async ({ page, extensionId, baseUrl }) => {
      const consoleMessages: string[] = []
      page.on('console', (msg) => consoleMessages.push(msg.text()))

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      const extensionResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      expect(extensionResult.applicationId).toBe('1234')

      await page.goto(baseUrl)

      const rumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      // Check that SDK does not get overwritten by extension
      expect(rumResult.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)

      expect(consoleMessages).toContain(
        'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
      )
    })

  createTest('SDK with correct allowedTrackingOrigins parameter works correctly')
    .withExtension(pathToChromeExtension)
    .run(async ({ page, extensionId }) => {
      const consoleMessages: string[] = []
      page.on('console', (msg) => consoleMessages.push(msg.text()))

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      const extensionResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
            allowedTrackingOrigins: '',
          }
      )

      expect(extensionResult.applicationId).toBe('1234')
      expect(extensionResult.allowedTrackingOrigins).toEqual(['chrome-extension://abcdefghijklmno'])
      expect(consoleMessages).not.toContain(
        'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
      )
      expect(consoleMessages).not.toContain('SDK is being initialized from an extension on a non-allowed domain.')
    })

  createTest('SDK with app.example.com allowedTrackingOrigins throws a warning')
    .withExtension(pathToExampleExtension)
    .withRum()
    .run(async ({ page, extensionId, baseUrl }) => {
      const consoleMessages: string[] = []
      page.on('console', (msg) => consoleMessages.push(msg.text()))

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      const extensionResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      await page.goto(baseUrl)

      const rumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      // Check that SDK does not get overwritten by extension
      expect(rumResult.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)

      expect(extensionResult.applicationId).toBe('1234')
      expect((extensionResult as any).allowedTrackingOrigins).toEqual(['https://app.example.com'])
      expect(consoleMessages).toContain(
        'Datadog Browser SDK: SDK is being initialized from an extension on a non-allowed domain.'
      )
    })
})
