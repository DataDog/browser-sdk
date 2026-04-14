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

test.describe('plugin: nuxt router', () => {
  createTest('should track the direct-entry route as the initial view')
    .withBasePath('/user/42?admin=true')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await flushEvents()

      const initialViews = intakeRegistry.rumViewEvents.filter((e) => e.view.loading_type === 'initial_load')
      expect(new Set(initialViews.map((event) => event.view.id)).size).toBe(1)

      const initialUserView = initialViews.find((event) => event.view.name === '/user/[id]')
      expect(initialUserView).toBeDefined()
      expect(initialUserView?.view.url).toContain('/user/42?admin=true')

      const spuriousHomeView = intakeRegistry.rumViewEvents.find(
        (e) => e.view.name === '/' && e.view.loading_type === 'initial_load'
      )
      expect(spuriousHomeView).toBeUndefined()
    })

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
  createTest('should capture vue error from vueApp.config.errorHandler')
    .withBasePath('/error-test')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
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

  createTest('should capture startup errors via app:error without duplicates')
    .withBasePath('/startup-error')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.waitForLoadState('networkidle')

      await flushEvents()

      const errorEvents = intakeRegistry.rumErrorEvents.filter(
        (event) => event.error.message === 'Nuxt startup error from app:error'
      )
      expect(errorEvents).toHaveLength(1)
      const [errorEvent] = errorEvents

      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.handling_stack).toBeDefined()
      expect(errorEvent.context).toMatchObject({
        framework: 'nuxt',
        nuxt: { source: 'vueApp.config.errorHandler' },
      })

      withBrowserLogs((browserLogs) => {
        expect(browserLogs.filter((log) => log.level === 'error').length).toBeGreaterThan(0)
      })
    })

  createTest('should capture app:error hook errors')
    .withBasePath('/app-error')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
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
