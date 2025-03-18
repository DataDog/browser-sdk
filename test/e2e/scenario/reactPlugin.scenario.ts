import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('react plugin', () => {
  createTest('should define a view name with createBrowserRouter')
    .withReact()
    .withRum()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/user/:id')
    })

  createTest('should send a react component render vital event')
    .withRum()
    .withReact()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.click('text=Go to Tracked')

      await flushEvents()
      const vitalEvents = intakeRegistry.rumVitalEvents[0]
      expect(vitalEvents.vital.description).toBe('TrackedPage')
      expect(vitalEvents.vital.duration).toEqual(expect.any(Number))
    })
})
