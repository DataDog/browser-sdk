import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

type TestBuilder = ReturnType<typeof createTest>

interface ErrorConfig {
  clientErrorMessage: string
  expectedFramework: string
  expectsBrowserConsoleErrors?: boolean
  expectsComponentStack?: boolean
}

interface ErrorPluginTestConfig {
  name: string
  loadApp: (builder: TestBuilder) => TestBuilder
  viewPrefix: string
  error: ErrorConfig
}

export function runBasePluginErrorTests(configs: ErrorPluginTestConfig[]) {
  for (const { name, loadApp, viewPrefix, error } of configs) {
    test.describe(`base plugin: ${name}`, () => {
      test.describe('errors', () => {
        loadApp(createTest('should report client-side error').withRum()).run(
          async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
            await page.click('text=Go to Error Test')
            await page.waitForURL(`**${viewPrefix}/error-test`)

            await page.click('[data-testid="trigger-error"]')
            await page.waitForSelector('[data-testid="error-handled"]')

            await flushEvents()

            const customErrors = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
            expect(customErrors).toHaveLength(1)
            expect(customErrors[0].error.message).toBe(error.clientErrorMessage)
            expect(customErrors[0].error.handling_stack).toBeDefined()
            expect(customErrors[0].error.stack).toBeDefined()
            if (error.expectsComponentStack) {
              expect(customErrors[0].error.component_stack).toBeDefined()
            }

            expect(customErrors[0].context?.framework).toEqual(error.expectedFramework)

            if (error.expectsBrowserConsoleErrors) {
              withBrowserLogs((browserLogs) => {
                expect(browserLogs.filter((log) => log.level === 'error').length).toBeGreaterThan(0)
              })
            }
          }
        )
      })
    })
  }
}
