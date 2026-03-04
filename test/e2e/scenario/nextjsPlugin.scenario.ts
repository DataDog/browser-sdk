import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('nextjs app router', () => {
  createTest('should track initial home view')
    .withRum()
    .withNextjsApp()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find((e) => e.view.name === '/' && e.view.loading_type === 'initial_load')
      expect(homeView).toBeDefined()
    })
  ;[
    { linkText: 'Go to User 42', url: '**/user/42', expectedViewName: '/user/[id]' },
    { linkText: 'Go to Guides 123', url: '**/guides/123', expectedViewName: '/guides/[...slug]' },
  ].forEach(({ linkText, url, expectedViewName }) => {
    createTest(`should normalize dynamic route to ${expectedViewName}`)
      .withRum()
      .withNextjsApp()
      .run(async ({ page, flushEvents, intakeRegistry }) => {
        await page.click(`text=${linkText}`)
        await page.waitForURL(url)

        await page.click('text=Back to Home')

        await flushEvents()

        const viewEvents = intakeRegistry.rumViewEvents
        expect(viewEvents.length).toBeGreaterThanOrEqual(2)

        const homeView = viewEvents.find((e) => e.view.name === '/')
        expect(homeView).toBeDefined()

        const dynamicView = viewEvents.find((e) => e.view.name === expectedViewName)
        expect(dynamicView).toBeDefined()
        expect(dynamicView?.view.loading_type).toBe('route_change')
      })
  })

  createTest('should track SPA navigation with loading_time')
    .withRum()
    .withNextjsApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42')

      await page.click('text=Back to Home')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      const homeView = viewEvents.find(
        (e) => e.view.name === '/' && e.view.loading_type === 'initial_load' && e.view.loading_time !== undefined
      )
      expect(homeView).toBeDefined()
      expect(homeView?.view.loading_time).toBeDefined()
      expect(homeView?.view.loading_time).toBeGreaterThan(0)
    })
})
