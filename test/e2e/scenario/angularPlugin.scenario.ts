import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('angular plugin', () => {
  createTest('should define a view name based on the route')
    .withRum()
    .withAngularApp('angular-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/user/:id')
    })

  createTest('should define a view name for nested routes')
    .withRum()
    .withAngularApp('angular-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to Admin Settings')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/admin/settings')
    })

  createTest('should define a view name for the initial route')
    .withRum()
    .withAngularApp('angular-app')
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const firstView = viewEvents[0]
      expect(firstView.view.name).toBe('/')
    })
})
