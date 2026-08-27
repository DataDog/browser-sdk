import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

test.describe('soft navigation', () => {
  const NAV_BUTTON = html`
    <button id="nav-button">Navigate</button>
    <script>
      document.querySelector('#nav-button').addEventListener('click', () => {
        const el = document.createElement('div')
        el.textContent = 'New page content'
        document.body.appendChild(el)
        history.pushState(null, '', '/soft-nav-route')
      })
    </script>
  `

  createTest('reports LCP on a route_change view created from a user-initiated soft navigation')
    .withRum({ enableExperimentalFeatures: ['soft_navigation'] })
    .withBody(NAV_BUTTON)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Excludes chromium-pinned (Chrome 120), which predates the Soft Navigation API (Chrome 151+).
      // browserName alone can't tell these apart since both normalize to 'chromium'.
      test.skip(test.info().project.name !== 'chromium', 'Soft navigation API requires current Chromium (151+)')

      await page.locator('#nav-button').click()
      // Let the async soft-navigation and interaction-contentful-paint PerformanceEntries settle.
      await page.waitForTimeout(100)

      await flushEvents()

      const routeChangeViews = intakeRegistry.rumViewEvents.filter((v) => v.view.loading_type === 'route_change')
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)

      const lastRouteChange = routeChangeViews[routeChangeViews.length - 1]
      expect(lastRouteChange.view.performance?.lcp?.timestamp).toBeGreaterThan(0)
    })

  createTest('does not report LCP on a route_change view without the experimental feature enabled')
    .withRum()
    .withBody(NAV_BUTTON)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Soft navigation API is Chromium-only')

      await page.locator('#nav-button').click()
      await page.waitForTimeout(100)

      await flushEvents()

      const routeChangeViews = intakeRegistry.rumViewEvents.filter((v) => v.view.loading_type === 'route_change')
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)

      const lastRouteChange = routeChangeViews[routeChangeViews.length - 1]
      expect(lastRouteChange.view.performance?.lcp).toBeUndefined()
    })

  createTest('does not error on browsers without the soft navigation API')
    .withRum({ enableExperimentalFeatures: ['soft_navigation'] })
    .withBody(NAV_BUTTON)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Runs on chromium-pinned (Chrome 120, genuinely lacks the API) plus firefox/webkit.
      // Excludes only current chromium -- project.name (not browserName) is what distinguishes
      // it from chromium-pinned, since both normalize to browserName 'chromium'.
      test.skip(test.info().project.name === 'chromium', 'This test validates behavior on browsers without soft-navigation API')

      await page.locator('#nav-button').click()
      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const initialLoadViews = viewEvents.filter((v) => v.view.loading_type === 'initial_load')
      const routeChangeViews = viewEvents.filter((v) => v.view.loading_type === 'route_change')

      expect(initialLoadViews.length).toBeGreaterThanOrEqual(1)
      expect(routeChangeViews.length).toBeGreaterThanOrEqual(1)
      expect(routeChangeViews[0].view.performance?.lcp).toBeUndefined()

      // No console errors -- automatically validated by test teardown.
    })
})
