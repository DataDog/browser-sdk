import { test, expect } from '@playwright/test'
import { createTest, npmSetup } from '../lib/framework'

test.describe('react plugin', () => {
  createTest('should define a view name with createBrowserRouter')
    .withUseReact()
    .withSetup(npmSetup)
    .withRum()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      console.log(await page.evaluate(() => window.DD_RUM?.getInitConfiguration()))
      await page.click('text=Go to User')
      await flushEvents()
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const lastView = viewEvents[viewEvents.length - 1]
      console.log(viewEvents)
      expect(lastView.view.name).toBe('/user/:id')
    })

  createTest('should send a react component render vital event')
    .withRum()
    .withUseReact()
    .withSetup(npmSetup)
    .run(async ({ flushEvents, intakeRegistry, page, baseUrl }) => {
      await page.goto(baseUrl)

      await page.click('text=Go to Tracked')

      await flushEvents()

      const vitalEvents = intakeRegistry.rumVitalEvents
      const reactRenderVitals = vitalEvents.filter((event) => event.vital.name === 'reactComponentRender')
      expect(reactRenderVitals.length).toBeGreaterThan(0)

      const lastRenderVital = reactRenderVitals[reactRenderVitals.length - 1]
      expect(lastRenderVital.vital.description).toBe('TrackedPage')
      expect(lastRenderVital.vital.duration).toEqual(expect.any(Number))
    })
})
