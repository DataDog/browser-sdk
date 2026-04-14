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
      clientErrorMessage: 'Error triggered by button click',
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
  createTest('should report startup errors via app:error hook')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry, baseUrl, flushBrowserLogs }) => {
      const url = new URL(baseUrl)
      url.searchParams.set('startup-error', '1')
      await page.goto(url.toString())

      await flushEvents()

      const startupErrors = intakeRegistry.rumErrorEvents.filter(
        (e) => e.error.source === 'custom' && e.error.message === 'Startup error triggered by plugin'
      )
      expect(startupErrors).toHaveLength(1)
      expect(startupErrors[0].context?.framework).toEqual('nuxt')
      expect(startupErrors[0].error.component_stack).toBeUndefined()

      flushBrowserLogs()
    })
})
