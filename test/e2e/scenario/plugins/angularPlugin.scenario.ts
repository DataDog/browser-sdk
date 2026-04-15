import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { runBasePluginRouterTests } from './basePluginRouterTests'
import { clickAndWaitForURL } from './navigationUtils'

const angularAppName = 'angular-app'
const angularBasePluginConfig = {
  name: angularAppName,
  loadApp: (b: ReturnType<typeof createTest>) => b.withApp(angularAppName),
  viewPrefix: '',
}

runBasePluginRouterTests([
  {
    ...angularBasePluginConfig,
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:slug',
    },
  },
])

runBasePluginErrorTests([
  {
    ...angularBasePluginConfig,
    error: {
      clientErrorMessage: 'Error triggered by button click',
      expectedFramework: 'angular',
      expectsBrowserConsoleErrors: true,
    },
  },
])

test.describe('plugin: angular', () => {
  createTest('should define a view name for nested routes')
    .withRum()
    .withApp(angularAppName)
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await clickAndWaitForURL(page, 'text=Go to Nested Route', '**/parent/nested')
      await flushEvents()

      const nestedView = intakeRegistry.rumViewEvents.find(
        (event) => event.view.name === '/parent/nested' && event.view.url?.includes('/parent/nested')
      )
      expect(nestedView).toBeDefined()
      expect(nestedView?.view.url).toContain('/parent/nested')
    })

  createTest('should define a view name with the actual path for wildcard routes')
    .withRum()
    .withApp(angularAppName)
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await clickAndWaitForURL(page, 'text=Go to Wildcard Route', '**/unknown/page')
      await flushEvents()

      const wildcardView = intakeRegistry.rumViewEvents.find(
        (event) => event.view.name === '/unknown/page' && event.view.url?.includes('/unknown/page')
      )
      expect(wildcardView).toBeDefined()
      expect(wildcardView?.view.url).toContain('/unknown/page')
    })

  createTest('should report errors caught by provideDatadogErrorHandler')
    .withRum()
    .withApp(angularAppName)
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.click('#throw-error')
      await flushEvents()

      const angularErrors = intakeRegistry.rumErrorEvents.filter((event) => event.context?.framework === 'angular')
      expect(angularErrors).toHaveLength(1)
      expect(angularErrors[0].error.message).toBe('angular error from component')
      expect(angularErrors[0].error.handling).toBe('handled')
      expect(angularErrors[0].error.source).toBe('custom')
      expect(angularErrors[0].error.handling_stack).toEqual(expect.stringContaining('angular error'))

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.filter((log) => log.level === 'error').length).toBeGreaterThan(0)
      })
    })

  createTest('should merge dd_context from the error object into the event context')
    .withRum()
    .withApp(angularAppName)
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.click('#throw-error-with-context')
      await flushEvents()

      const angularErrors = intakeRegistry.rumErrorEvents.filter((event) => event.context?.framework === 'angular')
      expect(angularErrors).toHaveLength(1)
      expect(angularErrors[0].error.message).toBe('angular error with dd_context')
      expect(angularErrors[0].context).toEqual(
        expect.objectContaining({
          framework: 'angular',
          component: 'InitialRoute',
          userId: 42,
        })
      )

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.filter((log) => log.level === 'error').length).toBeGreaterThan(0)
      })
    })
})
