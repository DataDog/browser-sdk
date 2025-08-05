import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

const reactApps = [
  { appName: 'react-router-v6-app', description: 'React Router v6' },
  { appName: 'react-router-v7-app', description: 'React Router v7' },
]

test.describe('react plugin', () => {
  for (const { appName, description } of reactApps) {
    test.describe(`with ${description}`, () => {
      createTest('should define a view name with createBrowserRouter')
        .withRum()
        .withReactApp(appName)
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
        .withReactApp(appName)
        .run(async ({ flushEvents, intakeRegistry, page }) => {
          await page.click('text=Go to Tracked')

          await flushEvents()
          const vitalEvents = intakeRegistry.rumVitalEvents[0]
          expect(vitalEvents.vital.description).toBe('TrackedPage')
          expect(vitalEvents.vital.duration).toEqual(expect.any(Number))
        })

      createTest('should capture react error from error boundary')
        .withRum()
        .withReactApp(appName)
        .run(async ({ page, flushEvents, intakeRegistry, browserName, withBrowserLogs }) => {
          await page.click('text=Go to Error')
          await page.click('#error-button')

          // Firefox may delay dispatching error events from React error boundaries,
          // causing flushEvents() to miss them, this timeout ensures the RUM event is captured.
          if (browserName === 'firefox') {
            await page.waitForTimeout(1000)
          }

          await flushEvents()
          expect(intakeRegistry.rumErrorEvents.length).toBeGreaterThan(0)
          const errorEvent = intakeRegistry.rumErrorEvents[1]

          expect(errorEvent.error.message).toBe('Error triggered by button click')
          expect(errorEvent.error.source).toBe('custom')
          expect(errorEvent.error.stack).toBeDefined()
          expect(errorEvent.context?.framework).toBe('react')
          expect(errorEvent.error.component_stack).toBeDefined()
          withBrowserLogs((browserLogs) => {
            expect(browserLogs.length).toBeGreaterThan(0)
          })
        })
    })
  }
})
