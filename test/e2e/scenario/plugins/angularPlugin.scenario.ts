import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { runBasePluginRouterTests } from './basePluginRouterTests'

const angularApps = [
  { appName: 'angular-v15-app', description: 'Angular v15', integrations: ['angular-v15', 'angular-router'] },
  { appName: 'angular-app', description: 'Angular v22', integrations: ['angular-v22', 'angular-router'] },
]

const angularPluginApps = angularApps.map(({ appName, description, integrations }) => ({
  name: `with ${description}`,
  loadApp: (b: ReturnType<typeof createTest>) => b.withApp(appName),
  viewPrefix: '',
  plugin: { name: 'angular', integrations },
}))

runBasePluginRouterTests(
  angularPluginApps.map((config) => ({
    ...config,
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:slug',
    },
  }))
)

runBasePluginErrorTests(
  angularPluginApps.map((config) => ({
    ...config,
    error: {
      clientErrorMessage: 'Error triggered by button click',
      expectedFramework: 'angular',
      expectsBrowserConsoleErrors: true,
    },
  }))
)

test.describe('plugin: angular', () => {
  for (const { appName: angularAppName, description } of angularApps) {
    test.describe(`with ${description}`, () => {
      createTest('should define a view name for nested routes')
        .withRum()
        .withApp(angularAppName)
        .run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('text=Go to Nested Route')
          await flushEvents()
          const viewEvents = intakeRegistry.rumViewEvents
          expect(viewEvents.length).toBeGreaterThan(0)
          const lastView = viewEvents[viewEvents.length - 1]
          expect(lastView.view.name).toBe('/parent/nested')
          expect(lastView.view.url).toContain('/parent/nested')
        })

      createTest('should define a view name with the actual path for wildcard routes')
        .withRum()
        .withApp(angularAppName)
        .run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('text=Go to Wildcard Route')
          await flushEvents()
          const viewEvents = intakeRegistry.rumViewEvents
          expect(viewEvents.length).toBeGreaterThan(0)
          const lastView = viewEvents[viewEvents.length - 1]
          expect(lastView.view.name).toBe('/unknown/page')
          expect(lastView.view.url).toContain('/unknown/page')
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
  }
})
