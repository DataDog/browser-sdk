import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

test.describe('soft navigation', () => {
  createTest('should annotate user-initiated route change with is_soft_navigation')
    .withRum({
      enableExperimentalFeatures: ['soft_navigation'],
    })
    .withBody(html`
      <button id="nav-button">Navigate</button>
      <script>
        document.querySelector('#nav-button').addEventListener('click', () => {
          const el = document.createElement('div')
          el.textContent = 'New page content'
          document.body.appendChild(el)
          history.pushState(null, '', '/soft-nav-route')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Soft navigation API is Chromium-only')

      const button = page.locator('#nav-button')
      await button.click()

      // Allow time for the soft-navigation PerformanceEntry to fire asynchronously
      await page.waitForTimeout(100)

      await flushEvents()

      const routeChangeViews = intakeRegistry.rumViewEvents.filter((v) => v.view.loading_type === 'route_change')
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)

      const lastRouteChange = routeChangeViews[routeChangeViews.length - 1]
      expect(lastRouteChange.view.is_soft_navigation).toBe(true)
    })

  createTest('should not annotate programmatic route change with is_soft_navigation')
    .withRum({
      enableExperimentalFeatures: ['soft_navigation'],
    })
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Soft navigation API is Chromium-only')

      await page.evaluate(() => {
        history.pushState(null, '', '/programmatic-route')
      })

      await flushEvents()

      const routeChangeViews = intakeRegistry.rumViewEvents.filter((v) => v.view.loading_type === 'route_change')
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)

      const lastRouteChange = routeChangeViews[routeChangeViews.length - 1]
      expect(lastRouteChange.view.is_soft_navigation).toBeUndefined()
    })

  createTest('should produce normal view events without errors when soft navigation is unsupported')
    .withRum({
      enableExperimentalFeatures: ['soft_navigation'],
    })
    .withBody(html`
      <button id="nav-button">Navigate</button>
      <script>
        document.querySelector('#nav-button').addEventListener('click', () => {
          const el = document.createElement('div')
          el.textContent = 'New page content'
          document.body.appendChild(el)
          history.pushState(null, '', '/new-route')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName === 'chromium', 'This test validates behavior on browsers without soft-navigation API')

      const button = page.locator('#nav-button')
      await button.click()

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const initialLoadViews = viewEvents.filter((v) => v.view.loading_type === 'initial_load')
      const routeChangeViews = viewEvents.filter((v) => v.view.loading_type === 'route_change')

      expect(initialLoadViews.length).toBeGreaterThanOrEqual(1)
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)
      expect(routeChangeViews[0].view.is_soft_navigation).toBeUndefined()

      // No console errors -- automatically validated by teardown
    })
})
