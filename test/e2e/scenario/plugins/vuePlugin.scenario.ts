import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { runBasePluginRouterTests } from './basePluginRouterTests'

const vueBasePluginConfig = {
  name: 'vue',
  loadApp: (b: ReturnType<typeof createTest>) => b.withVueApp(),
  viewPrefix: '',
}

runBasePluginRouterTests([
  {
    ...vueBasePluginConfig,
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:catchAll(.*)*',
    },
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
      await page.click('text=Go to Error Test')
      await page.click('[data-testid="trigger-error"]')

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
      const errorEvent = intakeRegistry.rumErrorEvents[intakeRegistry.rumErrorEvents.length - 1]

      expect(errorEvent.error.message).toBe('Error triggered by button click')
      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.stack).toBeDefined()
      expect(errorEvent.context?.framework).toBe('vue')
    })

  createTest('should send a vue component render vital event')
    .withRum()
    .withVueApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to Tracked')
      await flushEvents()

      const vitalEvent = intakeRegistry.rumVitalEvents[0]
      expect(vitalEvent.vital.description).toBe('TrackedPage')
      expect(vitalEvent.vital.duration).toEqual(expect.any(Number))
    })
})
