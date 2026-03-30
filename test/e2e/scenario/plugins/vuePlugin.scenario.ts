import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginTests } from './basePluginTests'

runBasePluginTests([
  {
    name: 'vue',
    loadApp: (b) => b.withVueApp(),
    viewPrefix: '',
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:catchAll(.*)*',
    },
    error: {
      clientErrorMessage: 'Error triggered by button click',
    },
  },
])

test.describe('plugin: vue', () => {
  createTest('should capture vue error from app.config.errorHandler')
    .withRum()
    .withVueApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Error')
      await page.click('[data-testid="trigger-error"]')

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
      const errorEvent = intakeRegistry.rumErrorEvents[intakeRegistry.rumErrorEvents.length - 1]

      expect(errorEvent.error.message).toBe('Error triggered by button click')
      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.stack).toBeDefined()
      expect(errorEvent.context?.framework).toBe('vue')
    })
})
