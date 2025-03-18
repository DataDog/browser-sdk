import { RecordType } from '@flashcatcloud/browser-rum/src/types'
import { test, expect } from '@playwright/test'
import { expireSession, findSessionCookie, renewSession } from '../../lib/helpers/session'
import { bundleSetup, createTest, waitForRequests } from '../../lib/framework'

test.describe('rum sessions', () => {
  test.describe('session renewal', () => {
    createTest('create a new View when the session is renewed')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await renewSession(page, browserContext)
        await flushEvents()
        const viewEvents = intakeRegistry.rumViewEvents
        const firstViewEvent = viewEvents[0]
        const lastViewEvent = viewEvents[viewEvents.length - 1]
        expect(firstViewEvent.session.id).not.toBe(lastViewEvent.session.id)
        expect(firstViewEvent.view.id).not.toBe(lastViewEvent.view.id)

        const distinctIds = new Set(viewEvents.map((viewEvent) => viewEvent.view.id))
        expect(distinctIds.size).toBe(2)
      })

    createTest('a single fullSnapshot is taken when the session is renewed')
      .withRum()
      .withSetup(bundleSetup)
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await renewSession(page, browserContext)

        await flushEvents()

        expect(intakeRegistry.replaySegments).toHaveLength(2)

        const segment = intakeRegistry.replaySegments.at(-1)!
        expect(segment.creation_reason).toBe('init')
        expect(segment.records[0].type).toBe(RecordType.Meta)
        expect(segment.records[1].type).toBe(RecordType.Focus)
        expect(segment.records[2].type).toBe(RecordType.FullSnapshot)
        expect(segment.records.slice(3).every((record) => record.type !== RecordType.FullSnapshot)).toBe(true)
      })
  })

  test.describe('session expiration', () => {
    createTest("don't send events when session is expired")
      // prevent recording start to generate late events
      .withRum({ startSessionReplayRecordingManually: true })
      .run(async ({ intakeRegistry, sendXhr, browserContext, page }) => {
        await expireSession(page, browserContext)
        intakeRegistry.empty()
        await sendXhr('/ok')
        expect(intakeRegistry.isEmpty).toBe(true)
      })
  })
  test.describe('anonymous user id', () => {
    createTest('persists when session is expired')
      .withRum()
      .run(async ({ flushEvents, browserContext, page }) => {
        const anonymousId = (await findSessionCookie(browserContext))?.aid

        await page.evaluate(() => {
          window.FC_RUM!.stopSession()
        })
        await flushEvents()

        expect((await findSessionCookie(browserContext))?.aid).toEqual(anonymousId)
      })

    createTest('persists when session renewed')
      .withRum()
      .run(async ({ browserContext, page }) => {
        const anonymousId = (await findSessionCookie(browserContext))?.aid
        expect(anonymousId).not.toBeNull()

        await page.evaluate(() => {
          window.FC_RUM!.stopSession()
        })
        await page.locator('html').click()

        // The session is not created right away, let's wait until we see a cookie
        await page.waitForTimeout(1000)

        expect((await findSessionCookie(browserContext))?.aid).toEqual(anonymousId)

        expect(true).toBeTruthy()
      })
  })

  test.describe('manual session expiration', () => {
    createTest('calling stopSession() stops the session')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              window.FC_RUM!.stopSession()
              setTimeout(() => {
                // If called directly after `stopSession`, the action start time may be the same as the
                // session end time. In this case, the sopped session is used, and the action is
                // collected.
                // We might want to improve this by having a strict comparison between the event start
                // time and session end time.
                window.FC_RUM!.addAction('foo')
                resolve()
              }, 5)
            })
        )
        await flushEvents()

        expect((await findSessionCookie(browserContext))?.isExpired).toEqual('1')
        expect(intakeRegistry.rumActionEvents).toHaveLength(0)
      })

    createTest('after calling stopSession(), a user interaction starts a new session')
      .withRum()
      .run(async ({ intakeRegistry, flushEvents, browserContext, page }) => {
        await page.evaluate(() => {
          window.FC_RUM!.stopSession()
        })

        await page.locator('html').click()

        // The session is not created right away, let's wait until we see a cookie
        await page.waitForTimeout(1000)

        await page.evaluate(() => {
          window.FC_RUM!.addAction('foo')
        })

        await flushEvents()

        expect((await findSessionCookie(browserContext))?.isExpired).not.toEqual('1')
        expect((await findSessionCookie(browserContext))?.id).toBeDefined()
        expect(intakeRegistry.rumActionEvents).toHaveLength(1)
      })

    createTest('flush events when the session expires')
      .withRum()
      .withLogs()
      .run(async ({ intakeRegistry, page }) => {
        expect(intakeRegistry.rumViewEvents).toHaveLength(0)
        expect(intakeRegistry.logsEvents).toHaveLength(0)
        expect(intakeRegistry.replaySegments).toHaveLength(0)

        await page.evaluate(() => {
          window.FC_LOGS!.logger.log('foo')
          window.FC_RUM!.stopSession()
        })

        await waitForRequests(page)

        expect(intakeRegistry.rumViewEvents).toHaveLength(1)
        expect(intakeRegistry.rumViewEvents[0].session.is_active).toBe(false)
        expect(intakeRegistry.logsEvents).toHaveLength(1)
        expect(intakeRegistry.replaySegments).toHaveLength(1)
      })
  })

  test.describe('third party cookie clearing', () => {
    createTest('after a 3rd party clears the cookies, do not restart a session on user interaction')
      .withRum()
      .run(async ({ intakeRegistry, deleteAllCookies, flushEvents, browserContext, page }) => {
        await deleteAllCookies()

        // Cookies are cached for 1s, wait until the cache expires
        await page.waitForTimeout(1100)

        await page.locator('html').click()

        await page.waitForTimeout(1100)

        await page.evaluate(() => {
          window.FC_RUM!.addAction('foo')
        })

        await flushEvents()

        expect(await findSessionCookie(browserContext)).toBeUndefined()
        expect(intakeRegistry.rumActionEvents).toHaveLength(0)
        expect(intakeRegistry.rumViewEvents).toHaveLength(1)
        expect(intakeRegistry.rumViewEvents[0].session.is_active).toBe(false)
      })
  })
})
