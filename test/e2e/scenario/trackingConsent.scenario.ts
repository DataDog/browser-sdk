import { SessionState } from '@datadog/browser-core'
import { createTest, flushEvents } from '../lib/framework'
import { test, expect, BrowserContext } from '@playwright/test'

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
          window.DD_RUM!.setTrackingConsent('granted')
        })

        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie(browserContext)).toBeDefined()
      })

    createTest('stops sending events if tracking consent is revoked')
      .withRum({ trackUserInteractions: true })
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await page.evaluate(() => {
          window.DD_RUM!.setTrackingConsent('not-granted')
        })

        const htmlElement = page.locator('html')
        await htmlElement.click()

        await flushEvents()

        expect(intakeRegistry.rumActionEvents).toEqual([])
        expect((await findSessionCookie(browserContext))?.isExpired).toEqual('1')
      })

    createTest('starts a new session when tracking consent is granted again')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        const initialSessionId = await findSessionCookie(browserContext)

        await page.evaluate(() => {
          window.DD_RUM!.setTrackingConsent('not-granted')
          window.DD_RUM!.setTrackingConsent('granted')
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
        window.DD_RUM!.setTrackingConsent('granted')
        window.DD_RUM!.init(configuration)
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
          window.DD_LOGS!.setTrackingConsent('granted')
        })

        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie(browserContext)).toBeDefined()
      })
  })
})

// TODO: use lib/helper/session when sessions.scenario is migrated
export async function findSessionCookie(browserContext: BrowserContext) {
  const cookies = await browserContext.cookies()
  // In some case, the session cookie is returned but with an empty value. Let's consider it expired
  // in this case.
  const rawValue = cookies[0]?.value
  if (!rawValue) {
    return
  }
  return Object.fromEntries(rawValue.split('&').map((part: string) => part.split('='))) as SessionState
}
