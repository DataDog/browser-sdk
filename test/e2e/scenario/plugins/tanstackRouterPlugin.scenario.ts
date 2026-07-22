import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginRouterTests } from './basePluginRouterTests'

runBasePluginRouterTests([
  {
    name: 'with TanStack Router',
    loadApp: (b) => b.withApp('tanstack-router-app'),
    viewPrefix: '',
    plugin: { name: 'react', routerType: 'tanstack-router-v1' },
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/$id',
      guidesRouteName: '/guides/$slug',
    },
  },
])

test.describe('tanstack router plugin', () => {
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
