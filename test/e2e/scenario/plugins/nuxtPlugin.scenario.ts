import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginRouterTests } from './basePluginRouterTests'
import { runBasePluginErrorTests } from './basePluginErrorTests'

const nuxtBasePluginConfig = {
  name: 'nuxt',
  loadApp: (b: ReturnType<typeof createTest>) => b.withNuxtApp(),
  viewPrefix: '',
}

runBasePluginRouterTests([
  {
    ...nuxtBasePluginConfig,
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/[id]',
      guidesRouteName: '/guides/[...slug]',
    },
  },
])

runBasePluginErrorTests([
  {
    ...nuxtBasePluginConfig,
    error: {
      clientErrorMessage: 'Nuxt error from vueApp.config.errorHandler',
      expectedFramework: 'nuxt',
      expectsComponentStack: true,
    },
  },
])

test.describe('plugin: nuxt router', () => {
  createTest('should create a new view when the hash changes')
    .withRum()
    .withNuxtApp()
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

test.describe('plugin: nuxt error', () => {
  createTest('should capture vue error from vueApp.config.errorHandler without duplicates')
    .withBasePath('/error-test')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('[data-testid="trigger-error"]')

      await flushEvents()

      const errorEvents = intakeRegistry.rumErrorEvents.filter((e) => e.error.source === 'custom')
      expect(errorEvents).toHaveLength(1)

      expect(errorEvents[0].error.message).toBe('Nuxt error from vueApp.config.errorHandler')
      expect(errorEvents[0].error.source).toBe('custom')
      expect(errorEvents[0].error.handling_stack).toBeDefined()
      expect(errorEvents[0].context).toMatchObject({ framework: 'nuxt' })
    })

  createTest('should capture startup errors via app:error without duplicates')
    .withBasePath('/startup-error')
    .withRum()
    .withNuxtApp()
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
