import { test, expect } from '@playwright/test'
import { findSessionCookie } from '../lib/helpers/session'
import { createTest } from '../lib/framework'

test.describe('tracking consent', () => {
  test.describe('RUM', () => {
    createTest('does not start the SDK if tracking consent is not given at init')
      .withRum({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry, flushEvents, browserContext }) => {
        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(true)
        expect(await findSessionCookie(browserContext)).toBeUndefined()
      })

    createTest('starts the SDK once tracking consent is granted')
      .withRum({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await page.evaluate(() => {
          window.FC_RUM!.setTrackingConsent('granted')
        })

        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie(browserContext)).toBeDefined()
      })

    createTest('stops sending events if tracking consent is revoked')
      .withRum({ trackUserInteractions: true })
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await page.evaluate(() => {
          window.FC_RUM!.setTrackingConsent('not-granted')
        })

        const htmlElement = page.locator('html')
        await htmlElement.click()

        await flushEvents()

        expect(intakeRegistry.rumActionEvents).toHaveLength(0)
        expect((await findSessionCookie(browserContext))?.isExpired).toEqual('1')
      })

    createTest('starts a new session when tracking consent is granted again')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        const initialSessionId = await findSessionCookie(browserContext)

        await page.evaluate(() => {
          window.FC_RUM!.setTrackingConsent('not-granted')
          window.FC_RUM!.setTrackingConsent('granted')
        })

        await flushEvents()

        const firstView = intakeRegistry.rumViewEvents[0]
        const lastView = intakeRegistry.rumViewEvents.at(-1)!
        expect(firstView.session.id).not.toEqual(lastView.session.id)
        expect(firstView.view.id).not.toEqual(lastView.view.id)
        expect(await findSessionCookie(browserContext)).not.toEqual(initialSessionId)
      })

    createTest('using setTrackingConsent before init overrides the init parameter')
      .withRum({ trackingConsent: 'not-granted' })
      .withRumInit((configuration) => {
        window.FC_RUM!.setTrackingConsent('granted')
        window.FC_RUM!.init(configuration)
      })
      .run(async ({ intakeRegistry, flushEvents, browserContext }) => {
        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie(browserContext)).toBeDefined()
      })
  })

  test.describe('Logs', () => {
    createTest('does not start the SDK if tracking consent is not given at init')
      .withLogs({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry, flushEvents, browserContext }) => {
        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(true)
        expect(await findSessionCookie(browserContext)).toBeUndefined()
      })

    createTest('starts the SDK once tracking consent is granted')
      .withLogs({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await page.evaluate(() => {
          window.FC_LOGS!.setTrackingConsent('granted')
        })

        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie(browserContext)).toBeDefined()
      })
  })
})
