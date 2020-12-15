import { createTest, html } from '../../lib/framework'
import { browserExecute, sendXhr } from '../../lib/helpers/browser'
import { expireSession, flushEvents, renewSession } from '../../lib/helpers/sdk'

describe('rum views', () => {
  createTest('send performance timings along the view events')
    .withRum()
    .run(async ({ events }) => {
      await flushEvents()
      const viewEvent = events.rumViews[0]
      expect(viewEvent).toBeDefined()
      expect(viewEvent.view.dom_complete).toBeGreaterThan(0)
      expect(viewEvent.view.dom_content_loaded).toBeGreaterThan(0)
      expect(viewEvent.view.dom_interactive).toBeGreaterThan(0)
      expect(viewEvent.view.load_event).toBeGreaterThan(0)
    })

  // When run via WebDriver, Safari 12 and 13 (at least) have an issue with `event.timeStamp`,
  // so the 'first-input' polyfill is ignoring it and doesn't send a performance entry.
  // See https://bugs.webkit.org/show_bug.cgi?id=211101
  if (browser.capabilities.browserName !== 'Safari 12.0') {
    createTest('send performance first input delay')
      .withRum()
      .withBody(
        html`
          <button>Hop</button>
        `
      )
      .run(async ({ events }) => {
        await (await $('button')).click()
        await flushEvents()
        const viewEvent = events.rumViews[0]
        expect(viewEvent).toBeDefined()
        expect(viewEvent.view.first_input_delay).toBeGreaterThanOrEqual(0)
      })
  }

  createTest('create a new View when the session is renewed')
    .withRum()
    .run(async ({ events }) => {
      await renewSession()
      await flushEvents()
      const viewEvents = events.rumViews
      const firstViewEvent = viewEvents[0]
      const lastViewEvent = viewEvents[viewEvents.length - 1]
      expect(firstViewEvent.session.id).not.toBe(lastViewEvent.session.id)
      expect(firstViewEvent.view.id).not.toBe(lastViewEvent.view.id)

      const distinctIds = new Set(viewEvents.map((viewEvent) => viewEvent.view.id))
      expect(distinctIds.size).toBe(2)
    })

  createTest("don't send events when session is expired")
    .withRum()
    .run(async ({ events }) => {
      await expireSession()
      events.empty()
      await sendXhr(`/ok`)
      expect(events.count).toBe(0)
    })

  describe('anchor navigation', () => {
    createTest("don't create a new view when it is an Anchor navigation")
      .withRum()
      .withBody(
        html`
          <a href="#test-anchor">anchor link</a>
          <div id="test-anchor"></div>
        `
      )
      .run(async ({ events }) => {
        await (await $('a')).click()

        await flushEvents()
        const viewEvents = events.rumViews

        expect(viewEvents.length).toBe(1)
        expect(viewEvents[0].view.loading_type).toBe('initial_load')
      })

    createTest('create a new view on hash change')
      .withRum()
      .run(async ({ events }) => {
        await browserExecute(() => {
          window.location.hash = '#bar'
        })

        await flushEvents()
        const viewEvents = events.rumViews

        expect(viewEvents.length).toBe(2)
        expect(viewEvents[0].view.loading_type).toBe('initial_load')
        expect(viewEvents[1].view.loading_type).toBe('route_change')
      })
  })
})
