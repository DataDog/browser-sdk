import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginTests } from './basePluginTests'

runBasePluginTests([
  {
    name: 'nuxt',
    loadApp: (b) => b.withNuxtApp(),
    viewPrefix: '',
    homeViewName: '/',
    homeUrlPattern: '**/',
    userRouteName: '/user/[id()]',
    guidesRouteName: '/guides/[...slug]',
    clientErrorMessage: 'Error triggered by button click',
  },
])

test.describe('nuxt plugin', () => {
  createTest('should capture nuxt error with framework: nuxt context')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
      await page.click('text=Go to Error Test')
      await page.waitForURL('**/error-test')
      await page.click('[data-testid="trigger-error"]')
      await page.waitForSelector('[data-testid="error-boundary"]')

      await flushEvents()

      const errorEvent = intakeRegistry.rumErrorEvents.find((e) => e.error.source === 'custom')
      expect(errorEvent).toBeDefined()
      expect(errorEvent?.context?.framework).toBe('nuxt')

      withBrowserLogs((_logs) => {
        // expected: Vue/Nuxt may emit console errors during error capture
      })
    })
})
