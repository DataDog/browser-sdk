import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginRouterTests } from './basePluginRouterTests'

const nuxtApps = [
  { routerVersion: 'v5' as const, description: 'Vue Router v5' },
  { routerVersion: 'v4' as const, description: 'Vue Router v4' },
]

const nuxtPluginApps = nuxtApps.map(({ routerVersion, description }) => ({
  name: `with Nuxt ${description}`,
  loadApp: (b: ReturnType<typeof createTest>) => b.withNuxtApp(routerVersion),
  viewPrefix: '',
}))

runBasePluginRouterTests(
  nuxtPluginApps.map(({ name, loadApp, viewPrefix }) => ({
    name,
    loadApp,
    viewPrefix,
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/[id]',
      guidesRouteName: '/guides/[...slug]',
    },
  }))
)

test.describe('plugin: nuxt router', () => {
  for (const { routerVersion, description } of nuxtApps) {
    test.describe(`with ${description}`, () => {
      createTest('should create a new view when the hash changes')
        .withRum()
        .withNuxtApp(routerVersion)
        .run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('text=Go to User 42')
          await page.waitForURL('**/user/42?admin=true')

          await page.click('text=Go to Section')
          await page.waitForURL('**/user/42#section')

          await flushEvents()

          const initialUserView = intakeRegistry.rumViewEvents.find(
            (e) => e.view.name === '/user/[id]' && e.view.url?.includes('/user/42?admin=true')
          )
          const hashUserView = intakeRegistry.rumViewEvents.find(
            (e) => e.view.name === '/user/[id]' && e.view.url?.includes('/user/42#section')
          )

          expect(initialUserView).toBeDefined()
          expect(hashUserView).toBeDefined()
          expect(hashUserView?.view.loading_type).toBe('route_change')
          expect(hashUserView?.view.id).not.toBe(initialUserView?.view.id)
        })
    })
  }
})

test.describe('plugin: nuxt error', () => {
  for (const { routerVersion, description } of nuxtApps) {
    test.describe(`with ${description}`, () => {
      createTest('should report client-side error')
        .withBasePath('/error-test')
        .withRum()
        .withNuxtApp(routerVersion)
        .run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('[data-testid="trigger-error"]')

          await flushEvents()

          const errorEvents = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
          expect(errorEvents).toHaveLength(1)

          expect(errorEvents[0].error.message).toBe('Nuxt error from vueApp.config.errorHandler')
          expect(errorEvents[0].error.source).toBe('custom')
          expect(errorEvents[0].error.handling_stack).toBeDefined()
          expect(errorEvents[0].error.stack).toBeDefined()
          expect(errorEvents[0].error.component_stack).toBeDefined()
          expect(errorEvents[0].context).toMatchObject({ framework: 'nuxt' })
        })

      createTest('should capture startup errors via app:error without duplicates')
        .withBasePath('/startup-error')
        .withRum()
        .withNuxtApp(routerVersion)
        .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
          await page.waitForLoadState('networkidle')

          await flushEvents()

          const errorEvents = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
          expect(errorEvents).toHaveLength(1)

          expect(errorEvents[0].error.source).toBe('custom')
          expect(errorEvents[0].error.handling_stack).toBeDefined()
          expect(errorEvents[0].context).toMatchObject({ framework: 'nuxt' })

          withBrowserLogs((browserLogs) => {
            expect(browserLogs.filter((log) => log.level === 'error').length).toBeGreaterThan(0)
          })
        })
    })
  }
})
