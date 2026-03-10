import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'
;[
  { name: 'nextjs app router', router: 'app' as const, viewPrefix: '', homeUrlPattern: '**/' },
  {
    name: 'nextjs pages router',
    router: 'pages' as const,
    viewPrefix: '/pages-router',
    homeUrlPattern: /\/pages-router(\?|$)/,
  },
].forEach(({ name, router, viewPrefix, homeUrlPattern }) => {
  const homeViewName = viewPrefix || '/'

  test.describe(name, () => {
    createTest('should track initial home view')
      .withRum()
      .withNextjsApp(router)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await page.click('text=Go to User 42')
        await page.waitForURL('**/user/42?admin=true')

        await flushEvents()

        const viewEvents = intakeRegistry.rumViewEvents
        const homeView = viewEvents.find((e) => e.view.name === homeViewName && e.view.loading_type === 'initial_load')
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
        await page.waitForURL(homeUrlPattern)

        await page.click('text=Go to User 42')
        await page.waitForURL('**/user/42?admin=true')

        await page.click('text=Back to Home')

        await flushEvents()

        const viewEvents = intakeRegistry.rumViewEvents

        const homeView = viewEvents.find((e) => e.view.name === homeViewName)
        expect(homeView).toBeDefined()

        const guidesView = viewEvents.find((e) => e.view.name === `${viewPrefix}/guides/[...slug]`)
        expect(guidesView).toBeDefined()
        expect(guidesView?.view.loading_type).toBe('route_change')
        expect(guidesView?.view.url).toContain('/guides/123')
        expect(guidesView?.view.referrer).toBe(baseUrl)

        const userView = viewEvents.find((e) => e.view.name === `${viewPrefix}/user/[id]`)
        expect(userView).toBeDefined()
        expect(userView?.view.loading_type).toBe('route_change')
        expect(userView?.view.url).toBe(`${baseOrigin}${viewPrefix}/user/42?admin=true`)
        expect(userView?.view.referrer).toBe(`${baseOrigin}${homeViewName}`)
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
          (e) =>
            e.view.name === homeViewName && e.view.loading_type === 'initial_load' && e.view.loading_time !== undefined
        )
        expect(homeView).toBeDefined()
        expect(homeView?.view.loading_time).toBeDefined()
        expect(homeView?.view.loading_time).toBeGreaterThan(0)
      })

    createTest('should not create a new view when only query params change')
      .withRum()
      .withNextjsApp(router)
      .run(async ({ page, flushEvents, intakeRegistry }) => {
        await page.click('text=Go to User 42')
        await page.waitForURL('**/user/42?admin=true')

        await page.click('text=Change query params')
        await page.waitForURL('**/user/42?admin=false')

        await flushEvents()

        const userView = intakeRegistry.rumViewEvents.find((e) => e.view.name === `${viewPrefix}/user/[id]`)
        expect(userView).toBeDefined()

        // No view should have been created for the query-param-only navigation
        const spuriousView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('admin=false'))
        expect(spuriousView).toBeUndefined()
      })
  })

  if (router === 'pages') {
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
          (e) => e.view.name === `${viewPrefix}/user/[id]` && e.view.url?.includes('/user/42')
        )
        const user999View = intakeRegistry.rumViewEvents.find(
          (e) => e.view.name === `${viewPrefix}/user/[id]` && e.view.url?.includes('/user/999')
        )
        expect(user42View).toBeDefined()
        expect(user999View).toBeDefined()
        expect(user999View?.view.referrer).toContain('/user/42')
      })
  } else {
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
  }
})
