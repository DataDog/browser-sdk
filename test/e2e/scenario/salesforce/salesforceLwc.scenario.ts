import { expect, test } from '@playwright/test'
import type { Request } from '@playwright/test'
import type { RumEvent } from '@datadog/browser-rum'
import {
  DEFAULT_RUM_CONFIGURATION,
  createTest,
  getEventIntakeEncoding,
  parseEventIntakePayload,
} from '../../lib/framework'
import { buildFrontdoorUrl, getSfSession } from './sfSession'
import type { SfSession } from './sfSession'

const resourceName = process.env.DD_SF_LWC_RESOURCE_NAME
const homePath = '/lightning/app/c__SF_LWC_App/page/home'

test.skip(!resourceName, 'Set DD_SF_LWC_RESOURCE_NAME to the deployed hashed Salesforce static resource name')

let sfSession: SfSession

test.beforeAll(() => {
  sfSession = getSfSession()
})

createTest('salesforce')
  .withSetup(() => '')
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    // Because the request to the local intake is coming from the deployed app, we need to use playwright's route to intercept the request and push it to the intake registry.
    // https://playwright.dev/docs/mock#modify-api-responses
    await page.route('*/**/api/v2/rum**', async (route) => {
      const request = route.request()

      intakeRegistry.push({
        intakeType: 'rum',
        isBridge: false,
        encoding: null,
        transport: null,
        batchTime: null,
        events: getRumEvents(request),
      })
      // We need to fulfill the request to send the events to the intake.
      const response = await route.fetch()
      await route.fulfill({ response })
    })

    // Authenticate in SF and navigate to the app.
    await page.goto(buildFrontdoorUrl(sfSession, buildSfLwcRetPath(resourceName!)))
    await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 60000 })
    await page.getByTestId('custom-action-1').click()
    await page.locator('a[href*="/lightning/n/Product_Explorer"]').click()
    await expect(page.getByTestId('product-explorer')).toBeVisible({ timeout: 60000 })

    await flushEvents()

    console.log('intakeRegistry', JSON.stringify(intakeRegistry.rumViewEvents, null, 2))

    // Verify that the initial view event is present.
    expect(intakeRegistry.rumViewEvents.length).toBeGreaterThanOrEqual(1)
    const homeView = intakeRegistry.rumViewEvents.find((e) => e.view.name?.includes('/lightning/page/home') === true)
    expect(homeView).toBeDefined()
    expect(homeView?.view.loading_type).toBe('initial_load')

    // Click on the custom action 1 and verify that the action event is present.
    expect(intakeRegistry.rumActionEvents.length).toBeGreaterThanOrEqual(1)
    const customAction = intakeRegistry.rumActionEvents.find(
      (e) => e.action.type === 'custom' && e.action.target?.name?.includes('custom action 1') === true
    )
    expect(customAction).toBeDefined()

    // Verify that the product explorer view event is present.
    const productExplorerView = intakeRegistry.rumViewEvents.find(
      (e) => e.view.name?.includes('/lightning/n/Product_Explorer') === true
    )
    expect(productExplorerView).toBeDefined()
    expect(productExplorerView?.view.loading_type).toBe('route_change')
  })

function buildSfLwcRetPath(resourceName: string) {
  const path = new URL(homePath, 'https://salesforce.test')
  path.searchParams.set('c__datadogResourceName', resourceName)
  path.searchParams.set(
    'c__datadogInitConfiguration',
    JSON.stringify({
      ...DEFAULT_RUM_CONFIGURATION,
      service: 'browser-sdk-salesforce-e2e',
      env: 'e2e',
    })
  )
  return `${path.pathname}${path.search}`
}

function getRumEvents(request: Request) {
  const body = request.postDataBuffer()
  const url = new URL(request.url())
  return body
    ? (parseEventIntakePayload(body, getEventIntakeEncoding(request.headers(), url.searchParams)) as RumEvent[])
    : []
}
