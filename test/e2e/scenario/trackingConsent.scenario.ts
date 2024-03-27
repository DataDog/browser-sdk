import { createTest, flushEvents } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { findSessionCookie, getSessionFromCookie } from '../lib/helpers/session'

describe('tracking consent', () => {
  describe('RUM', () => {
    createTest('does not start the SDK if tracking consent is not given at init')
      .withRum({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry }) => {
        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(true)
        expect(await findSessionCookie()).toBeUndefined()
      })

    createTest('starts the SDK once tracking consent is granted')
      .withRum({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry }) => {
        await browserExecute(() => {
          window.DD_RUM!.setTrackingConsent('granted')
        })

        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie()).toBeDefined()
      })

    createTest('stops sending events if tracking consent is revoked')
      .withRum({ trackUserInteractions: true })
      .run(async ({ intakeRegistry }) => {
        await browserExecute(() => {
          window.DD_RUM!.setTrackingConsent('not-granted')
        })

        const htmlElement = await $('html')
        await htmlElement.click()

        await flushEvents()

        const session = await getSessionFromCookie()

        expect(intakeRegistry.rumActionEvents).toEqual([])
        expect(session.id).toBe('null')
      })

    createTest('starts a new session when tracking consent is granted again')
      .withRum()
      .run(async ({ intakeRegistry }) => {
        const initialSessionId = await findSessionCookie()

        await browserExecute(() => {
          window.DD_RUM!.setTrackingConsent('not-granted')
          window.DD_RUM!.setTrackingConsent('granted')
        })

        await flushEvents()

        const firstView = intakeRegistry.rumViewEvents[0]
        const lastView = intakeRegistry.rumViewEvents.at(-1)!
        expect(firstView.session.id).not.toEqual(lastView.session.id)
        expect(firstView.view.id).not.toEqual(lastView.view.id)
        expect(await findSessionCookie()).not.toEqual(initialSessionId)
      })

    createTest('using setTrackingConsent before init overrides the init parameter')
      .withRum({ trackingConsent: 'not-granted' })
      .withRumInit((configuration) => {
        window.DD_RUM!.setTrackingConsent('granted')
        window.DD_RUM!.init(configuration)
      })
      .run(async ({ intakeRegistry }) => {
        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie()).toBeDefined()
      })
  })

  describe('Logs', () => {
    createTest('does not start the SDK if tracking consent is not given at init')
      .withLogs({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry }) => {
        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(true)
        expect(await findSessionCookie()).toBeUndefined()
      })

    createTest('starts the SDK once tracking consent is granted')
      .withLogs({ trackingConsent: 'not-granted' })
      .run(async ({ intakeRegistry }) => {
        await browserExecute(() => {
          window.DD_LOGS!.setTrackingConsent('granted')
        })

        await flushEvents()

        expect(intakeRegistry.isEmpty).toBe(false)
        expect(await findSessionCookie()).toBeDefined()
      })
  })
})
