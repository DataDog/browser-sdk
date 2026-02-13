import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('nextjs app router', () => {
  createTest('should track initial view')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find((e) => e.view.name === '/' && e.view.loading_type === 'initial_load')
      expect(homeView).toBeDefined()
    })

  createTest('should normalize dynamic route to /user/:id')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await page.click('text=Back to Home')
      await page.waitForURL('**/localhost:3000/')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(2)

      const homeView = viewEvents.find((e) => e.view.name === '/')
      expect(homeView).toBeDefined()

      const userView = viewEvents.find((e) => e.view.name === '/user/:id')
      expect(userView).toBeDefined()
      expect(userView?.view.loading_type).toBe('route_change')
    })

  createTest('should track SPA navigation with loading_time')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const userView = viewEvents.find((e) => e.view.name === '/user/:id' && e.view.loading_type === 'route_change')
      expect(userView).toBeDefined()
      expect(userView?.view.loading_time).toBeDefined()
      expect(userView?.view.loading_time).toBeGreaterThan(0)
    })

  createTest('should track back navigation via popstate')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await page.goBack()
      await page.waitForURL('**/localhost:3000/')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      // Should have at least 3 views: initial /, /user/:id, and back to /
      expect(viewEvents.filter((e) => e.view.name === '/').length).toBeGreaterThanOrEqual(2)
    })

  createTest('should send a react component render vital event')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to Tracked Component')
      await page.waitForURL('**/tracked')

      await page.click('text=Back to Home')
      await page.waitForURL('**/localhost:3000/')

      await flushEvents()

      const vitalEvents = intakeRegistry.rumVitalEvents
      expect(vitalEvents.length).toBeGreaterThan(0)

      const trackedVital = vitalEvents.find((e) => e.vital.description === 'TrackedPage')
      expect(trackedVital).toBeDefined()
      expect(trackedVital?.vital.duration).toEqual(expect.any(Number))
    })

  createTest('should capture react error from error boundary')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.click('text=Go to Error Test')
      await page.waitForURL('**/error-test')
      await page.click('#error-button')

      await page.click('text=Back to Home')
      await page.waitForURL('**/localhost:3000/')

      await flushEvents()

      const errorEvents = intakeRegistry.rumErrorEvents
      expect(errorEvents.length).toBeGreaterThan(0)

      const boundaryError = errorEvents.find((e) => e.error.message?.includes('Error triggered by button'))
      expect(boundaryError).toBeDefined()
      expect(boundaryError?.error.source).toBe('custom')
      expect(boundaryError?.context?.framework).toBe('react')
      expect(boundaryError?.error.component_stack).toBeDefined()

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toBeGreaterThan(0)
      })
    })
})
