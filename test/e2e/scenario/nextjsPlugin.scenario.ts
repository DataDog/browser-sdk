import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('nextjs app router', () => {
  createTest('should track initial home view')
    .withRum()
    .withNextjsApp()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find((e) => e.view.name === '/' && e.view.loading_type === 'initial_load')
      expect(homeView).toBeDefined()
    })

  createTest('should normalize dynamic route to /user/[id]')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await page.click('text=Back to Home')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(2)

      const homeView = viewEvents.find((e) => e.view.name === '/')
      expect(homeView).toBeDefined()

      const userView = viewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()
      expect(userView?.view.loading_type).toBe('route_change')
    })

  createTest('should track SPA navigation with loading_time')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await page.click('text=Back to Home')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find(
        (e) => e.view.name === '/' && e.view.loading_type === 'initial_load' && e.view.loading_time !== undefined
      )
      expect(homeView).toBeDefined()
      expect(homeView?.view.loading_time).toBeDefined()
      expect(homeView?.view.loading_time).toBeGreaterThan(0)
    })
})
