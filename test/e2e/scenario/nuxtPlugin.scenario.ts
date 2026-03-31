import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('nuxt - router', () => {
  createTest('should track initial home view')
    .withRum()
    .withNuxtApp()
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)
      const firstView = viewEvents[0]
      expect(firstView.view.name).toBe('/')
      expect(firstView.view.loading_type).toBe('initial_load')
    })

  createTest('should normalize dynamic routes and preserve real URLs and referrers')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry, baseUrl }) => {
      const baseOrigin = new URL(baseUrl).origin

      await page.click('text=Go to Guides 123')
      await page.waitForURL('**/guides/123')

      await page.click('text=Back to Home')
      await page.waitForURL('**/')

      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await page.click('text=Back to Home')

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents

      const homeView = viewEvents.find((e) => e.view.name === '/')
      expect(homeView).toBeDefined()

      const guidesView = viewEvents.find((e) => e.view.name === '/guides/[...slug]')
      expect(guidesView).toBeDefined()
      expect(guidesView?.view.loading_type).toBe('route_change')
      expect(guidesView?.view.url).toContain('/guides/123')
      expect(guidesView?.view.referrer).toBe(baseUrl)

      const userView = viewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()
      expect(userView?.view.loading_type).toBe('route_change')
      expect(userView?.view.url).toBe(`${baseOrigin}/user/42?admin=true`)
      expect(userView?.view.referrer).toBe(`${baseOrigin}/`)
    })

  createTest('should track SPA navigation with loading_time')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.waitForLoadState('networkidle')
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await page.click('text=Back to Home')

      await flushEvents()

      const homeView = intakeRegistry.rumViewEvents.find(
        (e) => e.view.name === '/' && e.view.loading_type === 'initial_load' && e.view.loading_time !== undefined
      )
      expect(homeView).toBeDefined()
      expect(homeView?.view.loading_time).toBeGreaterThan(0)
    })

  createTest('should not create a new view when only the hash changes')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await page.click('text=Go to Section')
      await page.waitForURL('**/user/42#section')

      await flushEvents()

      const userView = intakeRegistry.rumViewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()

      const spuriousView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('#section'))
      expect(spuriousView).toBeUndefined()
    })

  createTest('should not create a new view when only query params change')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await page.click('text=Change query params')
      await page.waitForURL('**/user/42?admin=false')

      await flushEvents()

      const userView = intakeRegistry.rumViewEvents.find((e) => e.view.name === '/user/[id]')
      expect(userView).toBeDefined()

      const spuriousView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('admin=false'))
      expect(spuriousView).toBeUndefined()
    })

  createTest('should track navigations between different concrete URLs of the same dynamic route')
    .withRum()
    .withNuxtApp()
    .run(async ({ page, flushEvents, intakeRegistry }) => {
      await page.click('text=Go to User 42')
      await page.waitForURL('**/user/42?admin=true')

      await page.click('text=Go to User 999')
      await page.waitForURL('**/user/999?admin=true')

      await flushEvents()

      const user42View = intakeRegistry.rumViewEvents.find(
        (e) => e.view.name === '/user/[id]' && e.view.url?.includes('/user/42')
      )
      const user999View = intakeRegistry.rumViewEvents.find(
        (e) => e.view.name === '/user/[id]' && e.view.url?.includes('/user/999')
      )
      expect(user42View).toBeDefined()
      expect(user999View).toBeDefined()
      expect(user999View?.view.referrer).toContain('/user/42')
    })
})
