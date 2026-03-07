import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'
;[
  { name: 'nextjs app router', router: 'app' as const },
  { name: 'nextjs pages router', router: 'pages' as const },
].forEach(({ name, router }) => {
  test.describe(name, () => {
    createTest('should track initial home view')
      .withRum()
      .withNextjsApp(router)
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
      .withNextjsApp(router)
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

    createTest('should track SPA navigation with loading_time')
      .withRum()
      .withNextjsApp(router)
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
})

test.describe('nextjs pages router', () => {
  createTest('should track navigations between different concrete URLs of the same dynamic route')
    .withRum()
    .withNextjsApp('pages')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      // Navigate directly to another user — same route pattern, different URL
      await page.click('text=Go to User 999')
      await page.waitForURL('**/user/999?admin=true')

      await flushEvents()

      const user42View = intakeRegistry.rumViewEvents.find(
        (e) => e.view.name === '/user/[id]' && e.view.url?.includes('/user/42')
      )
      const user999View = intakeRegistry.rumViewEvents.find(
        (e) => e.view.name === '/user/[id]' && e.view.url?.includes('/user/999')
      )
      expect(user42View).toBeDefined()
      expect(user999View).toBeDefined()
      expect(user999View?.view.referrer).toContain('/user/42')
    })
})

test.describe('nextjs app router', () => {
  createTest('should not be affected by parallel routes')
    .withRum()
    .withNextjsApp('app')
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

      const homeView = viewEvents.find((e) => e.view.name === '/')
      expect(homeView).toBeDefined()

      const userView = viewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()

      // No view should have @sidebar in the name
      expect(viewEvents.every((e) => !e.view.name?.includes('@sidebar'))).toBe(true)
    })
})
