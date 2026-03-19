import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('angular plugin', () => {
  createTest('should define a view name based on the route')
    .withRum()
    .withApp('angular-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to Parameterized Route')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/parameterized/:id')
      expect(lastView.view.url).toContain('/parameterized/42')
    })

  createTest('should define a view name for nested routes')
    .withRum()
    .withApp('angular-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to Nested Route')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/parent/nested')
      expect(lastView.view.url).toContain('/parent/nested')
    })

  createTest('should define a view name with the actual path for wildcard routes')
    .withRum()
    .withApp('angular-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to Wildcard Route')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/unknown/page')
      expect(lastView.view.url).toContain('/unknown/page')
    })

  createTest('should define a view name for the initial route')
    .withRum()
    .withApp('angular-app')
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const firstView = viewEvents[0]
      expect(firstView.view.name).toBe('/')
    })
})
