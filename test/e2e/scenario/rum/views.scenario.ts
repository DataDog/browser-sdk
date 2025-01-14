import { createTest, flushEvents, html } from '../../lib/framework'
import { getBrowserName } from '../../lib/helpers/browser'

describe('rum views', () => {
  createTest('send performance timings along the view events')
    .withRum()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()
      const viewEvent = intakeRegistry.rumViewEvents[0]
      expect(viewEvent).toBeDefined()
      expect(viewEvent.view.first_byte).toBeGreaterThan(0)
      expect(viewEvent.view.dom_complete).toBeGreaterThan(0)
      expect(viewEvent.view.dom_content_loaded).toBeGreaterThan(0)
      expect(viewEvent.view.dom_interactive).toBeGreaterThan(0)
      expect(viewEvent.view.load_event).toBeGreaterThan(0)
    })

  // When run via WebDriver, Safari <= 14 (at least) have an issue with `event.timeStamp`,
  // so the 'first-input' polyfill is ignoring it and doesn't send a performance entry.
  // See https://bugs.webkit.org/show_bug.cgi?id=211101
  if (getBrowserName() !== 'safari') {
    createTest('send performance first input delay')
      .withRum()
      .withBody(html` <button>Hop</button> `)
      .run(async ({ intakeRegistry }) => {
        await $('button').click()
        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent).toBeDefined()
        expect(viewEvent.view.first_input_delay).toBeGreaterThanOrEqual(0)
      })
  }

  describe('anchor navigation', () => {
    createTest("don't create a new view when it is an Anchor navigation")
      .withRum()
      .withBody(html`
        <a href="#test-anchor">anchor link</a>
        <div id="test-anchor"></div>
      `)
      .run(async ({ intakeRegistry }) => {
        await $('a').click()

        await flushEvents()
        const viewEvents = intakeRegistry.rumViewEvents

        expect(viewEvents.length).toBe(1)
        expect(viewEvents[0].view.loading_type).toBe('initial_load')
      })

    createTest('create a new view on hash change')
      .withRum()
      .run(async ({ intakeRegistry }) => {
        await browser.execute(() => {
          window.location.hash = '#bar'
        })

        await flushEvents()
        const viewEvents = intakeRegistry.rumViewEvents

        expect(viewEvents.length).toBe(2)
        expect(viewEvents[0].view.loading_type).toBe('initial_load')
        expect(viewEvents[1].view.loading_type).toBe('route_change')
      })
  })
})
