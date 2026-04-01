import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginTests } from './basePluginTests'

const routerConfigs = [
  {
    name: 'nextjs app router',
    routerType: 'app' as const,
    viewPrefix: '',
    homeUrlPattern: '**/',
    clientErrorMessage: 'Client error from error-test',
  },
  {
    name: 'nextjs pages router',
    routerType: 'pages' as const,
    viewPrefix: '/pages-router',
    homeUrlPattern: /\/pages-router(\?|$)/,
    clientErrorMessage: 'Pages Router error from NextjsErrorBoundary',
  },
]

runBasePluginTests(
  routerConfigs.map(({ name, routerType, viewPrefix, homeUrlPattern, clientErrorMessage }) => ({
    name,
    loadApp: (b) => b.withNextjsApp(routerType),
    viewPrefix,
    router: {
      homeViewName: viewPrefix || '/',
      homeUrlPattern,
      userRouteName: '/user/[id]',
      guidesRouteName: '/guides/[...slug]',
    },
    error: {
      clientErrorMessage,
      expectedFramework: 'nextjs',
      expectsBrowserConsoleErrors: true,
    },
  }))
)

test.describe('plugin: nextjs', () => {
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
