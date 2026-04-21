import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { createBasePluginRouterConfig, runBasePluginRouterTests } from './basePluginRouterTests'

const vueBasePluginConfig = {
  name: 'vue',
  loadApp: (b: ReturnType<typeof createTest>) => b.withVueApp(),
  viewPrefix: '',
}

runBasePluginRouterTests([
  {
    ...vueBasePluginConfig,
    router: createBasePluginRouterConfig({
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:catchAll(.*)*',
      viewPrefix: '',
    }),
  },
])

runBasePluginErrorTests([
  {
    ...vueBasePluginConfig,
    error: {
      clientErrorMessage: 'Error triggered by button click',
      expectedFramework: 'vue',
      expectsComponentStack: true,
    },
  },
])

test.describe('plugin: vue', () => {
  createTest('should capture vue error from app.config.errorHandler')
    .withRum()
    .withVueApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('[data-testid="go-to-error-test"]')
      await page.waitForSelector('[data-testid="trigger-error"]')
      await page.click('[data-testid="trigger-error"]')
      await page.waitForSelector('[data-testid="error-handled"]')

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
      const errorEvent = intakeRegistry.rumErrorEvents[intakeRegistry.rumErrorEvents.length - 1]

      expect(errorEvent.error.message).toBe('Error triggered by button click')
      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.stack).toBeDefined()
      expect(errorEvent.context?.framework).toBe('vue')
    })
})
