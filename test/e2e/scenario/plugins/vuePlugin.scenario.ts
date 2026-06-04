import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginErrorTests } from './basePluginErrorTests'
import { runBasePluginRouterTests } from './basePluginRouterTests'

const vueApps = [
  { routerVersion: 'v5' as const, description: 'Vue Router v5' },
  { routerVersion: 'v4' as const, description: 'Vue Router v4' },
]

const vuePluginApps = vueApps.map(({ routerVersion, description }) => ({
  name: `with ${description}`,
  loadApp: (b: ReturnType<typeof createTest>) => b.withVueApp(routerVersion),
  viewPrefix: '',
}))

runBasePluginRouterTests(
  vuePluginApps.map(({ name, loadApp, viewPrefix }) => ({
    name,
    loadApp,
    viewPrefix,
    router: {
      homeViewName: '/',
      homeUrlPattern: '**/',
      userRouteName: '/user/:id',
      guidesRouteName: '/guides/:catchAll(.*)*',
    },
  }))
)

runBasePluginErrorTests(
  vuePluginApps.map(({ name, loadApp, viewPrefix }) => ({
    name,
    loadApp,
    viewPrefix,
    error: {
      clientErrorMessage: 'Error triggered by button click',
      expectedFramework: 'vue',
      expectsComponentStack: true,
    },
  }))
)

test.describe('plugin: vue', () => {
  for (const { routerVersion, description } of vueApps) {
    test.describe(`with ${description}`, () => {
      createTest('should capture vue error from app.config.errorHandler')
        .withRum()
        .withVueApp(routerVersion)
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
    })
  }
})
