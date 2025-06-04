import path from 'path'
import { test, expect } from '@playwright/test'
import { DEFAULT_LOGS_CONFIGURATION, DEFAULT_RUM_CONFIGURATION, createTest } from '../../lib/framework'

// Different extension build paths for different configurations
const pathToBaseExtension = path.join(__dirname, '../../../../test/apps/extensions/base')
// Contains allowedTrackingOrigins parameter with chrome-extension origin
const pathToAllowedTrackingOriginExtension = path.join(
  __dirname,
  '../../../../test/apps/extensions/allowed-tracking-origin'
)
// Contains allowedTrackingOrigins parameter with app.example.com origin
const pathToInvalidTrackingOriginExtension = path.join(
  __dirname,
  '../../../../test/apps/extensions/invalid-tracking-origin'
)

const warningMessage =
  'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
const errorMessage = 'Datadog Browser SDK: SDK initialized on a non-allowed domain.'

test.describe('browser extensions', () => {
  createTest('popup page should load extension popup and display expected content')
    .withExtension(pathToBaseExtension)
    .run(async ({ page, getExtensionId }) => {
      const extensionId = await getExtensionId()
      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
      await expect(page).toHaveTitle(/Extension Popup/)
    })

  createTest(
    'SDK is initialized in an unsupported environment without allowedTrackingOrigins and warns when used in content script'
  )
    .withExtension(pathToBaseExtension)
    .withRum()
    .withLogs()
    .run(async ({ page, baseUrl, getExtensionId, withBrowserLogs }) => {
      const extensionId = await getExtensionId()

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      const rumResult = await page.evaluate(() => window.DD_RUM?.getInitConfiguration())
      const logsResult = await page.evaluate(() => window.DD_LOGS?.getInitConfiguration())
      expect(rumResult?.applicationId).toBe('1234')
      expect(logsResult?.clientToken).toBe('abcd')

      await page.goto(baseUrl)

      const pageRumResult = await page.evaluate(() => window.DD_RUM?.getInitConfiguration())
      const pageLogsResult = await page.evaluate(() => window.DD_LOGS?.getInitConfiguration())

      expect(pageRumResult?.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)
      expect(pageLogsResult?.clientToken).toBe(DEFAULT_LOGS_CONFIGURATION.clientToken)

      // Check for warnings in console messages - should have one from RUM and one from Logs
      // But since we also go to the base url, we can have more than 2 logs
      withBrowserLogs((logs) => {
        expect(logs.length).toBeGreaterThanOrEqual(2)
        expect(logs).toContainEqual(
          expect.objectContaining({
            level: 'warning',
            message: warningMessage,
          })
        )
      })
    })

  createTest('SDK with correct allowedTrackingOrigins parameter works correctly for both RUM and Logs')
    .withExtension(pathToAllowedTrackingOriginExtension)
    .run(async ({ page, getExtensionId, flushBrowserLogs }) => {
      const extensionId = await getExtensionId()
      const expectedOriginPattern = /^chrome-extension:\/\//
      const extensionLogs: any[] = []

      // Listen for console events and filter for extension page only
      // Because the test also goes to the base url, we need to filter for the extension page only
      page.on('console', (msg) => {
        const url = msg.location().url
        if (url && url.startsWith(`chrome-extension://${extensionId}`)) {
          extensionLogs.push({
            level: msg.type(),
            message: msg.text(),
            source: 'console',
            url,
          })
        }
      })

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      const rumResult = await page.evaluate(() => window.DD_RUM?.getInitConfiguration())
      const logsResult = await page.evaluate(() => window.DD_LOGS?.getInitConfiguration())

      expect(rumResult?.applicationId).toBe('1234')
      expect(rumResult?.allowedTrackingOrigins).toEqual([expectedOriginPattern])
      expect(logsResult?.clientToken).toBe('abcd')
      expect(logsResult?.allowedTrackingOrigins).toEqual([expectedOriginPattern])

      expect(extensionLogs).toEqual([])

      flushBrowserLogs()
    })

  createTest('SDK with incorrect allowedTrackingOrigins shows error message for both RUM and Logs')
    .withExtension(pathToInvalidTrackingOriginExtension)
    .withRum()
    .withLogs()
    .run(async ({ page, baseUrl, getExtensionId, withBrowserLogs }) => {
      const extensionId = await getExtensionId()

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      const rumResult = await page.evaluate(() => window.DD_RUM?.getInitConfiguration())
      const logsResult = await page.evaluate(() => window.DD_LOGS?.getInitConfiguration())

      expect(rumResult?.applicationId).toBe('1234')
      expect(rumResult?.allowedTrackingOrigins).toEqual(['https://app.example.com'])
      expect(logsResult?.clientToken).toBe('abcd')
      expect(logsResult?.allowedTrackingOrigins).toEqual(['https://app.example.com'])

      await page.goto(baseUrl)

      const pageRumResult = await page.evaluate(() => window.DD_RUM?.getInitConfiguration())
      const pageLogsResult = await page.evaluate(() => window.DD_LOGS?.getInitConfiguration())

      expect(pageRumResult?.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)
      expect(pageLogsResult?.clientToken).toBe(DEFAULT_LOGS_CONFIGURATION.clientToken)

      withBrowserLogs((logs) => {
        expect(logs.length).toBeGreaterThanOrEqual(2)
        expect(logs).toContainEqual(
          expect.objectContaining({
            level: 'error',
            message: errorMessage,
          })
        )
      })
    })
})
