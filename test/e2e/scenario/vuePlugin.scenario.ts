import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('vue plugin', () => {
  createTest('should define a view name with createRouter')
    .withRum()
    .withVueApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=User 42')
      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const userView = viewEvents.find((e) => e.view.name === '/user/:id')
      expect(userView).toBeDefined()
    })

  createTest('should capture vue error from app.config.errorHandler')
    .withRum()
    .withVueApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Error')
      await page.click('#error-button')

      await flushEvents()

      expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
      const errorEvent = intakeRegistry.rumErrorEvents[intakeRegistry.rumErrorEvents.length - 1]

      expect(errorEvent.error.message).toBe('Error triggered by button click')
      expect(errorEvent.error.source).toBe('custom')
      expect(errorEvent.error.stack).toBeDefined()
      expect(errorEvent.context?.framework).toBe('vue')
    })
})
