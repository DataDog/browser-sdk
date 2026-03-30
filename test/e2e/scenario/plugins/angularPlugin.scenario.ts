import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginTests } from './basePluginTests'

const angularApp = 'angular-app'

runBasePluginTests([
  {
    name: 'angular',
    loadApp: (b) => b.withApp(angularApp),
    viewPrefix: '',
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:slug',
    },
    error: {
      clientErrorMessage: 'Error triggered by button click',
    },
  },
])

test.describe('angular plugin', () => {
  createTest('should define a view name for nested routes')
    .withRum()
    .withApp(angularApp)
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
    .withApp(angularApp)
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
    .withApp(angularApp)
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
    .withApp(angularApp)
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
