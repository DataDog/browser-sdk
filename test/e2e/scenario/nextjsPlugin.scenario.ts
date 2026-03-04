import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('nextjs app router', () => {
  createTest('should track initial home view')
    .withRum()
    .withNextjsApp()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find((e) => e.view.name === '/' && e.view.loading_type === 'initial_load')
      expect(homeView).toBeDefined()
    })
  createTest('should normalize dynamic routes and preserve real URLs and referrers')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry, baseUrl }) => {
      const baseOrigin = new URL(baseUrl).origin

      // Home → Guides → Home → User (link includes ?admin=true) → Home
      await page.click('text=Go to Guides 123')
      await page.waitForURL('**/guides/123')

      await page.click('text=Back to Home')
      await page.waitForURL('**/')

      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await page.click('text=Back to Home')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents

      const homeView = viewEvents.find((e) => e.view.name === '/')
      expect(homeView).toBeDefined()

      const guidesView = viewEvents.find((e) => e.view.name === '/guides/[...slug]')
      expect(guidesView).toBeDefined()
      expect(guidesView?.view.loading_type).toBe('route_change')
      expect(guidesView?.view.url).toContain('/guides/123')
      expect(guidesView?.view.referrer).toBe(baseUrl)

      const userView = viewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()
      expect(userView?.view.loading_type).toBe('route_change')
      expect(userView?.view.url).toBe(`${baseOrigin}/user/42?admin=true`)
      expect(userView?.view.referrer).toBe(`${baseOrigin}/`)
    })

  createTest('should not be affected by parallel routes')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      // The @sidebar parallel route renders alongside the main content
      // but should not affect view names or URL structure
      await page.waitForSelector('[data-testid="sidebar"]')
      expect(await page.textContent('[data-testid="sidebar"]')).toContain('Sidebar: Home')

      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')
      expect(await page.textContent('[data-testid="sidebar"]')).toContain('Sidebar: User 42')

      await page.click('text=Back to Home')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents

      // View names should reflect the page route, not the parallel slot
      const homeView = viewEvents.find((e) => e.view.name === '/')
      expect(homeView).toBeDefined()

      const userView = viewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()

      // No view should have @sidebar in the name
      expect(viewEvents.every((e) => !e.view.name?.includes('@sidebar'))).toBe(true)
    })

  createTest('should track SPA navigation with loading_time')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

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
