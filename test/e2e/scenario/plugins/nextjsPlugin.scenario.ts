import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { runBasePluginRouterTests } from './basePluginRouterTests'

// v13 is the oldest Next.js version supported by the peer dependency range
const nextjsVersions = ['v16', 'v13'] as const

const nextjsVariants = nextjsVersions.flatMap((nextjsVersion) => [
  {
    name: `nextjs ${nextjsVersion} app router`,
    nextjsVersion,
    routerType: 'app' as const,
    integrations: [`nextjs-${nextjsVersion}`, 'app-router'],
    viewPrefix: '',
    homeUrlPattern: /\/(\?|$)/,
    clientErrorMessage: 'Client error from error-test',
    // Next.js < 15.3 has no `onRouterTransitionStart`, so App Router views are started before the URL changes
    viewUrlLimitation:
      nextjsVersion === 'v13' ? 'App Router views report the previous URL without onRouterTransitionStart' : undefined,
  },
  {
    name: `nextjs ${nextjsVersion} pages router`,
    nextjsVersion,
    routerType: 'pages' as const,
    integrations: [`nextjs-${nextjsVersion}`, 'pages-router'],
    viewPrefix: '/pages-router',
    homeUrlPattern: /\/pages-router(\?|$)/,
    clientErrorMessage: 'Pages Router error from NextjsErrorBoundary',
    viewUrlLimitation: undefined,
  },
])

runBasePluginRouterTests(
  nextjsVariants.map(
    ({ name, nextjsVersion, routerType, integrations, viewPrefix, homeUrlPattern, viewUrlLimitation }) => ({
      name,
      viewUrlLimitation,
      loadApp: (b: ReturnType<typeof createTest>) => b.withNextjsApp(routerType, nextjsVersion),
      viewPrefix,
      plugin: { name: 'nextjs', integrations },
      router: {
        homeViewName: viewPrefix || '/',
        homeUrlPattern,
        userRouteName: '/user/[id]',
        guidesRouteName: '/guides/[...slug]',
      },
    })
  )
)

runBasePluginErrorTests(
  nextjsVariants.map(({ name, nextjsVersion, routerType, viewPrefix, clientErrorMessage }) => ({
    name,
    loadApp: (b: ReturnType<typeof createTest>) => b.withNextjsApp(routerType, nextjsVersion),
    viewPrefix,
    error: {
      clientErrorMessage,
      expectedFramework: 'nextjs',
      expectsBrowserConsoleErrors: true,
    },
  }))
)

for (const nextjsVersion of nextjsVersions) {
  test.describe(`plugin: nextjs ${nextjsVersion}`, () => {
    createTest('should create only one view when a root layout client chunk is delayed')
      .withRum()
      .withBasePath('/?delay-client-chunk')
      .withNextjsApp('app', nextjsVersion)
      .run(async ({ page, baseUrl, flushEvents, intakeRegistry }) => {
        await page.waitForFunction(() => performance.getEntriesByName('root-hydration-marker').length === 1)
        await flushEvents()
        intakeRegistry.empty()

        let delayedChunks = 0
        await page.route('**/_next/static/chunks/*.js', async (route) => {
          const response = await route.fetch()
          // Find the sibling's chunk without depending on its generated filename.
          if ((await response.text()).includes('root-hydration-marker')) {
            delayedChunks++
            await new Promise((resolve) => setTimeout(resolve, 150))
          }
          await route.fulfill({ response })
        })

        await page.goto(baseUrl)
        await page.waitForFunction(() => performance.getEntriesByName('root-hydration-marker').length === 1)
        await flushEvents()

        expect(delayedChunks).toBe(1)
        const views = [...new Map(intakeRegistry.rumViewEvents.map((event) => [event.view.id, event.view])).values()]
        expect([...new Set(views.map((view) => view.url))]).toEqual([baseUrl])
        expect(views).toHaveLength(1)
      })

    createTest('should not be affected by parallel routes')
      .withRum()
      .withNextjsApp('app', nextjsVersion)
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
      .withNextjsApp('app', nextjsVersion)
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
      .withNextjsApp('app', nextjsVersion)
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
}
