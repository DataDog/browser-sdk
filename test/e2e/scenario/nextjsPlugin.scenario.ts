import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('nextjs app router', () => {
  createTest('should track initial home view')
    .withRum()
    .withNextjsApp('/')
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find((e) => e.view.name === '/' && e.view.loading_type === 'initial_load')
      expect(homeView).toBeDefined()
    })
})
