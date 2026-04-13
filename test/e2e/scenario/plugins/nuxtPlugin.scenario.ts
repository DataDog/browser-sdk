import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginRouterTests } from './basePluginRouterTests'

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

test.describe('plugin: nuxt', () => {
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

  createTest('should capture vue error from vueApp.config.errorHandler')
    .withBasePath('/error-test')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await page.click('[data-testid="trigger-error"]')

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
      const errorEvent = intakeRegistry.rumErrorEvents[intakeRegistry.rumErrorEvents.length - 1]

      expect(errorEvent.error.message).toBe('Nuxt error from vueApp.config.errorHandler')
      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.handling_stack).toBeDefined()
      expect(errorEvent.context).toMatchObject({
        framework: 'nuxt',
        nuxt: { source: 'vueApp.config.errorHandler' },
      })
    })

  createTest('should capture app:error hook errors')
    .withBasePath('/app-error')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await page.click('[data-testid="trigger-app-error"]')

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
      const errorEvent = intakeRegistry.rumErrorEvents[intakeRegistry.rumErrorEvents.length - 1]

      expect(errorEvent.error.message).toBe('Nuxt app:error hook error')
      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.handling_stack).toBeDefined()
      expect(errorEvent.context).toMatchObject({
        framework: 'nuxt',
        nuxt: { source: 'app:error' },
      })
    })
})
