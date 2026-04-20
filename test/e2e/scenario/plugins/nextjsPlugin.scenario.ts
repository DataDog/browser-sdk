import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { createBasePluginRouterConfig, runBasePluginRouterTests } from './basePluginRouterTests'
import { clickAndWaitForURL, goHome } from './navigationUtils'

const nextjsVariants = [
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

runBasePluginRouterTests(
  nextjsVariants.map(({ name, routerType, viewPrefix, homeUrlPattern }) => ({
    name,
    loadApp: (b: ReturnType<typeof createTest>) => b.withNextjsApp(routerType),
    viewPrefix,
    router: createBasePluginRouterConfig({
      homeViewName: viewPrefix || '/',
      homeUrlPattern,
      userRouteName: '/user/[id]',
      guidesRouteName: '/guides/[...slug]',
      viewPrefix,
    }),
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
      errorHandledSelector: '[data-testid="error-handled"][data-error-reported]',
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

      await clickAndWaitForURL(
        page,
        '[data-testid="go-to-user"]',
        '**/user/42?admin=true',
        '[data-testid="change-query-params"]'
      )

      expect(await page.textContent('[data-testid="sidebar"]')).toContain('Sidebar: User 42')

      await goHome(page, {
        clickSelector: '[data-testid="back-to-home"]',
        urlPattern: '**/',
        readySelector: '[data-testid="go-to-user"]',
      })

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
      await clickAndWaitForURL(
        page,
        '[data-testid="go-to-server-error"]',
        '**/error-test/server-error?throw=true',
        '[data-testid="error-handled"][data-error-reported]'
      )

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
      await clickAndWaitForURL(
        page,
        '[data-testid="go-to-global-error"]',
        '**/global-error-test?throw=true',
        '[data-testid="global-error-boundary"]'
      )

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
