import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { runBasePluginTests } from './basePluginTests'

const reactApps = [
  { appName: 'react-router-v6-app', description: 'React Router v6' },
  { appName: 'react-router-v7-app', description: 'React Router v7' },
]

runBasePluginTests(
  reactApps.map(({ appName, description }) => ({
    name: `with ${description}`,
    loadApp: (b) => b.withApp(appName),
    viewPrefix: '',
    homeViewName: '/',
    homeUrlPattern: '**/',
    userRouteName: '/user/:id',
    guidesRouteName: '/guides/:slug',
    clientErrorMessage: 'Error triggered by button click',
  }))
)

test.describe('react plugin', () => {
  for (const { appName, description } of reactApps) {
    test.describe(`with ${description}`, () => {
      createTest('should send a react component render vital event')
        .withRum()
        .withApp(appName)
        .run(async ({ flushEvents, intakeRegistry, page }) => {
          await page.click('text=Go to Tracked')

          await flushEvents()
          const vitalEvents = intakeRegistry.rumVitalEvents[0]
          expect(vitalEvents.vital.description).toBe('TrackedPage')
          expect(vitalEvents.vital.duration).toEqual(expect.any(Number))
        })

      createTest('should substitute splat routes with the actual matched path')
        .withRum()
        .withApp(appName)
        .run(async ({ page, flushEvents, intakeRegistry }) => {
          await page.click('text=Go to Wildcard')
          await page.waitForURL('**/wildcard/foo/bar')

          await flushEvents()

          const wildcardView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('/wildcard/foo/bar'))
          expect(wildcardView).toBeDefined()
          expect(wildcardView?.view.name).toBe('/wildcard/foo/bar')
        })

      createTest('should capture react error from error boundary')
        .withRum()
        .withApp(appName)
        .run(async ({ page, flushEvents, intakeRegistry, browserName, withBrowserLogs }) => {
          await page.click('text=Go to Error Test')
          await page.waitForURL('**/error-test')
          await page.click('[data-testid="trigger-error"]')
          await page.waitForSelector('[data-testid="error-boundary"]')

          // Firefox may delay dispatching error events from React error boundaries,
          // causing flushEvents() to miss them, this timeout ensures the RUM event is captured.
          if (browserName === 'firefox') {
            await page.waitForTimeout(1000)
          }

          await flushEvents()

          const errorEvent = intakeRegistry.rumErrorEvents.find(
            (e) => e.error.source === 'custom' && e.error.message === 'Error triggered by button click'
          )
          expect(errorEvent).toBeDefined()
          expect(errorEvent?.error.stack).toBeDefined()
          expect(errorEvent?.context?.framework).toBe('react')
          expect(errorEvent?.error.component_stack).toBeDefined()

          withBrowserLogs((_logs) => {
            // expected
          })
        })
    })
  }
})
