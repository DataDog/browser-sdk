import { RecordType } from '@datadog/browser-rum/src/types'
import { expireSession, findSessionCookie, renewSession } from '../../lib/helpers/session'
import { bundleSetup, createTest, flushEvents, waitForRequests } from '../../lib/framework'
import { browserExecute, browserExecuteAsync, deleteAllCookies, sendXhr } from '../../lib/helpers/browser'

describe('rum sessions', () => {
  describe('session renewal', () => {
    createTest('create a new View when the session is renewed')
      .withRum()
      .run(async ({ intakeRegistry }) => {
        await renewSession()
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
      .run(async ({ intakeRegistry }) => {
        await renewSession()

        await flushEvents()

        expect(intakeRegistry.replaySegments.length).toBe(2)

        const segment = intakeRegistry.replaySegments.at(-1)!
        expect(segment.creation_reason).toBe('init')
        expect(segment.records[0].type).toBe(RecordType.Meta)
        expect(segment.records[1].type).toBe(RecordType.Focus)
        expect(segment.records[2].type).toBe(RecordType.FullSnapshot)
        expect(segment.records.slice(3).every((record) => record.type !== RecordType.FullSnapshot)).toBe(true)
      })
  })

  describe('session expiration', () => {
    createTest("don't send events when session is expired")
      // prevent recording start to generate late events
      .withRum({ startSessionReplayRecordingManually: true })
      .run(async ({ intakeRegistry }) => {
        await expireSession()
        intakeRegistry.empty()
        await sendXhr('/ok')
        expect(intakeRegistry.isEmpty).toBe(true)
      })
  })

  describe('manual session expiration', () => {
    createTest('calling stopSession() stops the session')
      .withRum()
      .run(async ({ intakeRegistry }) => {
        await browserExecuteAsync<void>((done) => {
          window.DD_RUM!.stopSession()
          setTimeout(() => {
            // If called directly after `stopSession`, the action start time may be the same as the
            // session end time. In this case, the sopped session is used, and the action is
            // collected.
            // We might want to improve this by having a strict comparison between the event start
            // time and session end time.
            window.DD_RUM!.addAction('foo')
            done()
          }, 5)
        })
        await flushEvents()

        expect(await findSessionCookie()).toBe('expired=0')
        expect(intakeRegistry.rumActionEvents.length).toBe(0)
      })

    createTest('after calling stopSession(), a user interaction starts a new session')
      .withRum()
      .run(async ({ intakeRegistry }) => {
        await browserExecute(() => {
          window.DD_RUM!.stopSession()
        })

        await (await $('html')).click()

        // The session is not created right away, let's wait until we see a cookie
        await browser.waitUntil(async () => Boolean(await findSessionCookie()))

        await browserExecute(() => {
          window.DD_RUM!.addAction('foo')
        })

        await flushEvents()

        expect(await findSessionCookie()).not.toContain('expired=0')
        expect(await findSessionCookie()).toMatch(/id=[a-f0-9-]+/)
        expect(intakeRegistry.rumActionEvents.length).toBe(1)
      })

    createTest('flush events when the session expires')
      .withRum()
      .withLogs()
      .run(async ({ intakeRegistry }) => {
        expect(intakeRegistry.rumViewEvents.length).toBe(0)
        expect(intakeRegistry.logsEvents.length).toBe(0)
        expect(intakeRegistry.replaySegments.length).toBe(0)

        await browserExecute(() => {
          window.DD_LOGS!.logger.log('foo')
          window.DD_RUM!.stopSession()
        })

        await waitForRequests()

        expect(intakeRegistry.rumViewEvents.length).toBe(1)
        expect(intakeRegistry.rumViewEvents[0].session.is_active).toBe(false)
        expect(intakeRegistry.logsEvents.length).toBe(1)
        expect(intakeRegistry.replaySegments.length).toBe(1)
      })
  })

  describe('third party cookie clearing', () => {
    createTest('after a 3rd party clears the cookies, stop the session')
      .withRum()
      .run(async ({ intakeRegistry }) => {
        await deleteAllCookies()

        // Cookies are cached for 1s, wait until the cache expires
        await browser.pause(1100)

        await browserExecute(() => {
          window.DD_RUM!.addAction('foo')
        })

        await flushEvents()

        expect(await findSessionCookie()).toBeUndefined()
        expect(intakeRegistry.rumActionEvents.length).toBe(0)
        expect(intakeRegistry.rumViewEvents.length).toBe(1)
        expect(intakeRegistry.rumViewEvents[0].session.is_active).toBe(false)
      })
  })
})
