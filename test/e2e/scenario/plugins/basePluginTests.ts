import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

type TestBuilder = ReturnType<typeof createTest>

export interface RouterConfig {
  homeViewName: string
  homeUrlPattern: string | RegExp
  userRouteName: string
  guidesRouteName: string
}

export interface ErrorConfig {
  clientErrorMessage: string
  expectedFramework: string
  expectsBrowserConsoleErrors?: boolean
  expectsComponentStack?: boolean
}

export interface PluginTestConfig {
  name: string
  loadApp: (builder: TestBuilder) => TestBuilder
  viewPrefix: string
  router: RouterConfig
  error?: ErrorConfig
}

export function runBasePluginTests(configs: PluginTestConfig[]) {
  for (const { name, loadApp, viewPrefix, router, error } of configs) {
    const { homeViewName, homeUrlPattern, userRouteName, guidesRouteName } = router

    test.describe(`base plugin: ${name}`, () => {
      test.describe('router', () => {
        loadApp(createTest('should track initial home view').withRum()).run(async ({ flushEvents, intakeRegistry }) => {
          await flushEvents()

          const viewEvents = intakeRegistry.rumViewEvents
          expect(viewEvents.length).toBeGreaterThan(0)
          const firstView = viewEvents[0]
          expect(firstView.view.name).toBe(homeViewName)
          expect(firstView.view.loading_type).toBe('initial_load')
        })

        loadApp(createTest('should normalize dynamic routes and preserve real URLs and referrers').withRum()).run(
          async ({ page, flushEvents, intakeRegistry, baseUrl }) => {
            const baseOrigin = new URL(baseUrl).origin

            // Home → Guides → Home → User → Home
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
            await page.click('text=Go to User 42')
            await page.waitForURL('**/user/42?admin=true')

            await page.click('text=Back to Home')

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

        loadApp(
          createTest('should not create a new view when only the hash changes or query params change').withRum()
        ).run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('text=Go to User 42')
          await page.waitForURL('**/user/42?admin=true')

          await page.click('text=Go to Section')
          await page.waitForURL('**/user/42#section')

          await page.click('text=Change query params')
          await page.waitForURL('**/user/42?admin=false')

          await flushEvents()

          const userView = intakeRegistry.rumViewEvents.find((e) => e.view.name === `${viewPrefix}${userRouteName}`)
          expect(userView).toBeDefined()

          const spuriousView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('#section'))
          expect(spuriousView).toBeUndefined()

          const queryParamsView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('admin=false'))
          expect(queryParamsView).toBeUndefined()
        })

        loadApp(
          createTest('should track navigations between different concrete URLs of the same dynamic route').withRum()
        ).run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('text=Go to User 42')
          await page.waitForURL('**/user/42?admin=true')

          await page.click('text=Go to User 999')
          await page.waitForURL('**/user/999?admin=true')

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

      if (error) {
        test.describe('errors', () => {
          loadApp(createTest('should report client-side error').withRum()).run(
            async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
              await page.click('text=Go to Error Test')
              await page.waitForURL(`**${viewPrefix}/error-test`)

              await page.click('[data-testid="trigger-error"]')
              await page.waitForSelector('[data-testid="error-handled"]')

              await flushEvents()

              const customErrors = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
              expect(customErrors).toHaveLength(1)
              expect(customErrors[0].error.message).toBe(error.clientErrorMessage)
              expect(customErrors[0].error.handling_stack).toBeDefined()
              expect(customErrors[0].error.stack).toBeDefined()
              if (error.expectsComponentStack) {
                expect(customErrors[0].error.component_stack).toBeDefined()
              }

              expect(customErrors[0].context?.framework).toEqual(error.expectedFramework)

              if (error.expectsBrowserConsoleErrors) {
                withBrowserLogs((browserLogs) => {
                  expect(browserLogs.filter((log) => log.level === 'error').length).toBeGreaterThan(0)
                })
              }
            }
          )
        })
      }
    })
  }
}
