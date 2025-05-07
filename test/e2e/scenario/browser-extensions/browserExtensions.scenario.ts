import path from 'path'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { DEFAULT_RUM_CONFIGURATION } from 'lib/framework/createTest'

const pathToExtension = path.join(__dirname, '../../../../test/apps/extension')

test.describe('browser extensions', () => {
  console.log('test')
  createTest('popup page should load extension popup and display expected content')
    .withExtension(pathToExtension)
    .run(async ({ page, extensionId }) => {
      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
      await expect(page.locator('body')).toHaveText(/Extension Popup/)
    })

    createTest("SDK is initialized in an unsupported environment without allowedTrackingOrigins and warns when used in content script")
    .withExtension(pathToExtension)
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
})
