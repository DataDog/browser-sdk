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

test.describe('browser extensions', () => {
  createTest('popup page should load extension popup and display expected content')
    .withExtension(pathToBaseExtension)
    .run(async ({ page, getExtensionId }) => {
      const extensionId = await getExtensionId()
      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
      await expect(page.locator('body')).toHaveText(/Extension Popup/)
    })

  createTest(
    'SDK is initialized in an unsupported environment without allowedTrackingOrigins and warns when used in content script'
  )
    .withExtension(pathToBaseExtension)
    .withRum()
    .withLogs()
    .run(async ({ page, baseUrl, getExtensionId }) => {
      const extensionId = await getExtensionId()
      const consoleMessages: string[] = []
      page.on('console', (msg) => consoleMessages.push(msg.text()))

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      // Check RUM initialization
      const rumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      const logsResult = await page.evaluate(
        () =>
          window.DD_LOGS?.getInitConfiguration() ?? {
            clientToken: '',
          }
      )
      expect(rumResult.applicationId).toBe('1234')
      expect(logsResult.clientToken).toBe('abcd')

      await page.goto(baseUrl)

      // Check that RUM and Logs SDKs do not get overwritten by extension
      const pageRumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      const pageLogsResult = await page.evaluate(
        () =>
          window.DD_LOGS?.getInitConfiguration() ?? {
            clientToken: '',
          }
      )

      expect(pageRumResult.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)
      expect(pageLogsResult.clientToken).toBe(DEFAULT_LOGS_CONFIGURATION.clientToken)

      // Check for warnings in console messages - should have one from RUM and one from Logs
      const warningMessage =
        'Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
      const warningCount = consoleMessages.filter((msg) => msg.includes(warningMessage)).length
      expect(warningCount).toBe(2)
    })

  createTest('SDK with correct allowedTrackingOrigins parameter works correctly for both RUM and Logs')
    .withExtension(pathToAllowedTrackingOriginExtension)
    .run(async ({ page, getExtensionId }) => {
      const extensionId = await getExtensionId()
      const expectedOrigin = `chrome-extension://`
      const consoleMessages: string[] = []
      page.on('console', (msg) => consoleMessages.push(msg.text()))

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      // Check RUM initialization
      const rumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
            allowedTrackingOrigins: [],
          }
      )

      const logsResult = await page.evaluate(
        () =>
          window.DD_LOGS?.getInitConfiguration() ?? {
            clientToken: '',
          }
      )

      expect(rumResult.applicationId).toBe('1234')
      expect(rumResult.allowedTrackingOrigins).toEqual([expectedOrigin])
      expect(logsResult.clientToken).toBe('abcd')
      expect(logsResult.allowedTrackingOrigins).toEqual([expectedOrigin])

      expect(consoleMessages).toEqual([])
    })

  createTest('SDK with incorrect allowedTrackingOrigins shows warning for both RUM and Logs')
    .withExtension(pathToInvalidTrackingOriginExtension)
    .withRum()
    .withLogs()
    .run(async ({ page, baseUrl, getExtensionId }) => {
      const extensionId = await getExtensionId()
      const consoleMessages: string[] = []
      page.on('console', (msg) => consoleMessages.push(msg.text()))

      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)

      // Check RUM initialization
      const rumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
            allowedTrackingOrigins: [],
          }
      )

      const logsResult = await page.evaluate(
        () =>
          window.DD_LOGS?.getInitConfiguration() ?? {
            clientToken: '',
          }
      )

      expect(rumResult.applicationId).toBe('1234')
      expect(rumResult.allowedTrackingOrigins).toEqual(['https://app.example.com'])
      expect(logsResult.clientToken).toBe('abcd')
      expect(logsResult.allowedTrackingOrigins).toEqual(['https://app.example.com'])

      await page.goto(baseUrl)

      // Check that SDK does not get overwritten by extension
      const pageRumResult = await page.evaluate(
        () =>
          window.DD_RUM?.getInitConfiguration() ?? {
            applicationId: '',
          }
      )

      const pageLogsResult = await page.evaluate(
        () =>
          window.DD_LOGS?.getInitConfiguration() ?? {
            clientToken: '',
          }
      )

      expect(pageRumResult.applicationId).toBe(DEFAULT_RUM_CONFIGURATION.applicationId)
      expect(pageLogsResult.clientToken).toBe(DEFAULT_LOGS_CONFIGURATION.clientToken)

      // Check warning messages - should have one from RUM and one from Logs
      const warningMessage = 'SDK is being initialized on a non-allowed domain.'
      const warningCount = consoleMessages.filter((msg) => msg.includes(warningMessage)).length
      expect(warningCount).toBeGreaterThanOrEqual(2)
    })
})
