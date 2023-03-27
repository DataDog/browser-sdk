import { createTest, flushEvents } from '../../lib/framework'
import { browserExecute, browserExecuteAsync } from '../../lib/helpers/browser'
import { findSessionCookie } from '../../lib/helpers/session'

describe('rum sessions', () => {
  createTest('calling stopSession() stops the session')
    .withRum()
    .run(async ({ serverEvents }) => {
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

      expect(await findSessionCookie()).toBeUndefined()
      expect(serverEvents.rumActions.length).toBe(0)
    })

  createTest('after calling stopSession(), a user interaction starts a new session')
    .withRum()
    .run(async ({ serverEvents }) => {
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

      expect(await findSessionCookie()).not.toBeUndefined()
      expect(serverEvents.rumActions.length).toBe(1)
    })
})
