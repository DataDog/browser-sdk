import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('tanstack router plugin', () => {
  createTest('should track the initial view')
    .withRum()
    .withApp('tanstack-router-app')
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const firstView = viewEvents[0]
      expect(firstView.view.name).toBe('/')
    })

  createTest('should define a view name with parameterized route')
    .withRum()
    .withApp('tanstack-router-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Post 42')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/posts/$postId')
      expect(lastView.view.url).toContain('/posts/42')
    })

  createTest('should not create a new view on query param changes')
    .withRum()
    .withApp('tanstack-router-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Query Param')
      await flushEvents()
      // Only the initial view should exist — query param change should not create a new one
      expect(intakeRegistry.rumViewEvents).toHaveLength(1)
    })

  createTest('should track a view with a splat route')
    .withRum()
    .withApp('tanstack-router-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Splat')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/files/path/to/file')
      expect(lastView.view.url).toContain('/files/path/to/file')
    })

  createTest('should track the redirect destination view')
    .withRum()
    .withApp('tanstack-router-app')
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Redirect')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      expect(lastView.view.name).toBe('/posts')
      expect(lastView.view.url).toContain('/posts')
    })
})
