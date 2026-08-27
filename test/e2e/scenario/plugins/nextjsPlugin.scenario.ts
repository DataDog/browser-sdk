import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { runBasePluginRouterTests } from './basePluginRouterTests'

const nextjsVariants = [
  {
    name: 'nextjs app router',
    routerType: 'app' as const,
    integrations: ['nextjs-v16', 'app-router'],
    viewPrefix: '',
    homeUrlPattern: /\/(\?|$)/,
    clientErrorMessage: 'Client error from error-test',
  },
  {
    name: 'nextjs pages router',
    routerType: 'pages' as const,
    integrations: ['nextjs-v16', 'pages-router'],
    viewPrefix: '/pages-router',
    homeUrlPattern: /\/pages-router(\?|$)/,
    clientErrorMessage: 'Pages Router error from NextjsErrorBoundary',
  },
]

runBasePluginRouterTests(
  nextjsVariants.map(({ name, routerType, integrations, viewPrefix, homeUrlPattern }) => ({
    name,
    loadApp: (b: ReturnType<typeof createTest>) => b.withNextjsApp(routerType),
    viewPrefix,
    plugin: { name: 'nextjs', integrations },
    router: {
      homeViewName: viewPrefix || '/',
      homeUrlPattern,
      userRouteName: '/user/[id]',
      guidesRouteName: '/guides/[...slug]',
    },
  }))
)

runBasePluginErrorTests(
  nextjsVariants.map(({ name, routerType, viewPrefix, clientErrorMessage }) => ({
    name,
    loadApp: (b: ReturnType<typeof createTest>) => b.withNextjsApp(routerType),
    viewPrefix,
    error: {
      clientErrorMessage,
      expectedFramework: 'nextjs',
      expectsBrowserConsoleErrors: true,
    },
  }))
)

test.describe('plugin: nextjs', () => {
  createTest('should not create views from discarded renders')
    .withRum()
    .withNextjsApp('app')
    .run(async ({ page, flushEvents, intakeRegistry, baseUrl }) => {
      await flushEvents()
      intakeRegistry.empty()

      const discardedRenderUrl = new URL(baseUrl)
      discardedRenderUrl.searchParams.set('discard-nextjs-render', 'true')

      await page.goto(discardedRenderUrl.href)
      await page.waitForSelector('[data-testid="discarded-render-probe-ready"]', { state: 'attached' })
      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const viewIds = new Set(viewEvents.map((event) => event.view.id))

      expect(viewIds.size).toBe(1)
      expect(viewEvents[0].view.loading_type).toBe('initial_load')
    })

  createTest('should start a slow navigation view before the route commits')
    .withRum()
    .withNextjsApp('app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      const navigationStartedAt = Date.now()

      await page.click('text=Go to Slow Page')
      await page.waitForURL('**/slow')
      await page.waitForSelector('text=Slow Page')
      const routeCommittedAt = Date.now()

      await flushEvents()

      const slowView = intakeRegistry.rumViewEvents.find((event) => event.view.name === '/slow')
      expect(slowView).toBeDefined()
      expect(slowView?.view.loading_type).toBe('route_change')
      expect(slowView?.date).toBeGreaterThanOrEqual(navigationStartedAt)
      expect(routeCommittedAt - slowView!.date).toBeGreaterThan(500)
    })

  createTest('should not be affected by parallel routes')
    .withRum()
    .withNextjsApp('app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
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

      expect(viewEvents.every((e) => !e.view.name?.includes('@sidebar'))).toBe(true)
    })

  createTest('should report a server error with digest via addNextjsError')
    .withRum()
    .withNextjsApp('app')
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.click('text=Go to Server Error')
      await page.waitForSelector('[data-testid="error-handled"]')

      await flushEvents()

      const customErrors = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
      expect(customErrors).toHaveLength(1)
      expect(customErrors[0].error.handling_stack).toBeDefined()
      expect(customErrors[0].context).toMatchObject({
        framework: 'nextjs',
        nextjs: { digest: expect.any(String) },
      })

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toBeGreaterThan(0)
      })
    })

  createTest('should report global error via global-error.tsx')
    .withRum()
    .withNextjsApp('app')
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.click('text=Go to Global Error')
      await page.waitForSelector('[data-testid="global-error-boundary"]')

      await flushEvents()

      const customErrors = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
      expect(customErrors).toHaveLength(1)
      expect(customErrors[0].error.handling_stack).toBeDefined()
      expect(customErrors[0].context).toMatchObject({ framework: 'nextjs' })

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toBeGreaterThan(0)
      })
    })
})
