import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import type { NavigationTarget, UrlPattern } from './navigationUtils'
import { clickAndWaitForURL, goHome } from './navigationUtils'

type TestBuilder = ReturnType<typeof createTest>

interface RouteNavigation extends NavigationTarget {
  urlPattern: UrlPattern
}

interface RouterConfig {
  homeViewName: string
  homeNavigation: RouteNavigation
  userRouteName: string
  guidesRouteName: string
  navigation: {
    guides: RouteNavigation
    user: RouteNavigation
    queryChange: RouteNavigation
    otherUser: RouteNavigation
  }
}

interface RouterPluginTestConfig {
  name: string
  loadApp: (builder: TestBuilder) => TestBuilder
  viewPrefix: string
  router: RouterConfig
}

interface RouteFixtures {
  guideSlug: string
  userId: string
  otherUserId: string
}

interface CreateBasePluginRouterConfigParams {
  homeViewName: string
  homeUrlPattern: UrlPattern
  userRouteName: string
  guidesRouteName: string
  viewPrefix: string
  fixtures?: Partial<RouteFixtures>
}

const DEFAULT_ROUTE_FIXTURES: RouteFixtures = {
  guideSlug: '123',
  userId: '42',
  otherUserId: '999',
}

export function createBasePluginRouterConfig({
  homeViewName,
  homeUrlPattern,
  userRouteName,
  guidesRouteName,
  viewPrefix,
  fixtures,
}: CreateBasePluginRouterConfigParams): RouterConfig {
  const { guideSlug, userId, otherUserId } = { ...DEFAULT_ROUTE_FIXTURES, ...fixtures }

  return {
    homeViewName,
    homeNavigation: {
      clickSelector: '[data-testid="back-to-home"]',
      urlPattern: homeUrlPattern,
      readySelector: '[data-testid="go-to-user"]',
    },
    userRouteName,
    guidesRouteName,
    navigation: {
      guides: {
        clickSelector: '[data-testid="go-to-guides"]',
        urlPattern: `**${viewPrefix}/guides/${guideSlug}`,
        readySelector: '[data-testid="back-to-home"]',
      },
      user: {
        clickSelector: '[data-testid="go-to-user"]',
        urlPattern: `**${viewPrefix}/user/${userId}?admin=true`,
        readySelector: '[data-testid="back-to-home"]',
      },
      queryChange: {
        clickSelector: '[data-testid="change-query-params"]',
        urlPattern: `**${viewPrefix}/user/${userId}?admin=false`,
      },
      otherUser: {
        clickSelector: '[data-testid="go-to-other-user"]',
        urlPattern: `**${viewPrefix}/user/${otherUserId}?admin=true`,
      },
    },
  }
}

async function clickAndWaitForNavigation(page: Page, navigation: RouteNavigation) {
  await clickAndWaitForURL(page, navigation.clickSelector, navigation.urlPattern, navigation.readySelector)
}

export function runBasePluginRouterTests(configs: RouterPluginTestConfig[]) {
  for (const { name, loadApp, viewPrefix, router } of configs) {
    const { homeViewName, homeNavigation, userRouteName, guidesRouteName, navigation } = router

    test.describe(`base plugin: ${name}`, () => {
      test.describe('router', () => {
        loadApp(createTest('should track initial home view').withRum()).run(async ({ flushEvents, intakeRegistry }) => {
          await flushEvents()

          const viewEvents = intakeRegistry.rumViewEvents
          expect(viewEvents.length).toBeGreaterThan(0)
          const initialHomeView = viewEvents.find(
            (e) => e.view.name === homeViewName && e.view.loading_type === 'initial_load'
          )
          expect(initialHomeView).toBeDefined()
        })

        loadApp(createTest('should normalize dynamic routes and preserve real URLs and referrers').withRum()).run(
          async ({ page, flushEvents, intakeRegistry, baseUrl }) => {
            const baseOrigin = new URL(baseUrl).origin

            // Home → Guides → Home → User → Home
            await clickAndWaitForNavigation(page, navigation.guides)

            await goHome(page, homeNavigation)

            await clickAndWaitForNavigation(page, navigation.user)

            await goHome(page, homeNavigation)

            await flushEvents()

            const viewEvents = intakeRegistry.rumViewEvents

            const homeView = viewEvents.find((e) => e.view.name === homeViewName)
            expect(homeView).toBeDefined()

            const guidesView = viewEvents.find((e) => e.view.name === `${viewPrefix}${guidesRouteName}`)
            expect(guidesView).toBeDefined()
            expect(guidesView?.view.loading_type).toBe('route_change')
            expect(guidesView?.view.url).toContain('/guides/123')
            expect(guidesView?.view.referrer).toBe(baseUrl)

            const userView = viewEvents.find((e) => e.view.name === `${viewPrefix}${userRouteName}`)
            expect(userView).toBeDefined()
            expect(userView?.view.loading_type).toBe('route_change')
            expect(userView?.view.url).toBe(`${baseOrigin}${viewPrefix}/user/42?admin=true`)
            expect(userView?.view.referrer).toBe(`${baseOrigin}${homeViewName}`)
          }
        )

        loadApp(createTest('should track SPA navigation with loading_time').withRum()).run(
          async ({ page, flushEvents, intakeRegistry }) => {
            await page.waitForLoadState('networkidle')
            await clickAndWaitForNavigation(page, navigation.user)

            await goHome(page, homeNavigation)

            await flushEvents()

            const homeView = intakeRegistry.rumViewEvents.find(
              (e) =>
                e.view.name === homeViewName &&
                e.view.loading_type === 'initial_load' &&
                e.view.loading_time !== undefined
            )
            expect(homeView).toBeDefined()
            expect(homeView?.view.loading_time).toBeGreaterThan(0)
          }
        )

        loadApp(createTest('should not create a new view when query params change').withRum()).run(
          async ({ page, flushEvents, intakeRegistry }) => {
            await clickAndWaitForNavigation(page, navigation.user)

            await clickAndWaitForNavigation(page, navigation.queryChange)

            await flushEvents()

            const userView = intakeRegistry.rumViewEvents.find((e) => e.view.name === `${viewPrefix}${userRouteName}`)
            expect(userView).toBeDefined()

            const queryParamsView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('admin=false'))
            expect(queryParamsView).toBeUndefined()
          }
        )

        loadApp(
          createTest('should track navigations between different concrete URLs of the same dynamic route').withRum()
        ).run(async ({ page, flushEvents, intakeRegistry }) => {
          await clickAndWaitForNavigation(page, navigation.user)

          await clickAndWaitForNavigation(page, navigation.otherUser)

          await flushEvents()

          const user42View = intakeRegistry.rumViewEvents.find(
            (e) => e.view.name === `${viewPrefix}${userRouteName}` && e.view.url?.includes('/user/42')
          )
          const user999View = intakeRegistry.rumViewEvents.find(
            (e) => e.view.name === `${viewPrefix}${userRouteName}` && e.view.url?.includes('/user/999')
          )
          expect(user42View).toBeDefined()
          expect(user999View).toBeDefined()
          expect(user999View?.view.referrer).toContain('/user/42')
        })
      })
    })
  }
}
