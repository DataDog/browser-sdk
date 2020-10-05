import { createTest } from '../../lib/createTest'
import { browserExecute, expireSession, flushEvents, renewSession, sendXhr } from '../../lib/helpers'
import { ServerRumViewLoadingType } from '../../lib/serverTypes'
import { allSetups, html } from '../../lib/setups'

describe('rum views', () => {
  createTest('send performance timings along the view events', allSetups({ rum: {} }), async ({ events }) => {
    await flushEvents()
    const viewEvent = events.rumViews[0]
    expect(viewEvent).toBeDefined()
    const measures = viewEvent!.view.measures!
    expect(measures.dom_complete).toBeGreaterThan(0)
    expect(measures.dom_content_loaded).toBeGreaterThan(0)
    expect(measures.dom_interactive).toBeGreaterThan(0)
    expect(measures.load_event_end).toBeGreaterThan(0)
  })

  createTest('create a new View when the session is renewed', allSetups({ rum: {} }), async ({ events }) => {
    await renewSession()
    await flushEvents()
    const viewEvents = events.rumViews
    const firstViewEvent = viewEvents[0]
    const lastViewEvent = viewEvents[viewEvents.length - 1]
    expect(firstViewEvent.session_id).not.toBe(lastViewEvent.session_id)
    expect(firstViewEvent.view.id).not.toBe(lastViewEvent.view.id)

    const distinctIds = new Set(viewEvents.map((viewEvent) => viewEvent.view.id))
    expect(distinctIds.size).toBe(2)
  })

  createTest("don't send events when session is expired", allSetups({ rum: {} }), async ({ events }) => {
    await expireSession()
    events.empty()
    await sendXhr(`/ok`)
    expect(events.all.length).toBe(0)
  })

  describe('anchor navigation', () => {
    createTest(
      "don't create a new view when it is an Anchor navigation",
      allSetups({
        body: html`
          <a href="#test-anchor">anchor link</a>
          <div id="test-anchor"></div>
        `,
        rum: {},
      }),
      async ({ events }) => {
        await (await $('a')).click()

        await flushEvents()
        const viewEvents = events.rumViews

        expect(viewEvents.length).toBe(1)
        expect(viewEvents[0].view.loading_type).toBe(ServerRumViewLoadingType.INITIAL_LOAD)
      }
    )

    createTest('create a new view on hash change', allSetups({ rum: {} }), async ({ events }) => {
      await browserExecute(() => {
        window.location.hash = '#bar'
      })

      await flushEvents()
      const viewEvents = events.rumViews

      expect(viewEvents.length).toBe(2)
      expect(viewEvents[0].view.loading_type).toBe(ServerRumViewLoadingType.INITIAL_LOAD)
      expect(viewEvents[1].view.loading_type).toBe(ServerRumViewLoadingType.ROUTE_CHANGE)
    })
  })
})
