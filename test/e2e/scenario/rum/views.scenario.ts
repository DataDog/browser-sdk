import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

test.describe('rum views', () => {
  createTest('send performance timings along the view events')
    .withRum()
    .run(async ({ flushEvents, intakeRegistry }) => {
      await flushEvents()
      const viewEvent = intakeRegistry.rumViewEvents[0]
      expect(viewEvent).toBeDefined()
      expect(viewEvent.view.first_byte).toBeGreaterThan(0)
      expect(viewEvent.view.dom_complete).toBeGreaterThan(0)
      expect(viewEvent.view.dom_content_loaded).toBeGreaterThan(0)
      expect(viewEvent.view.dom_interactive).toBeGreaterThan(0)
      expect(viewEvent.view.load_event).toBeGreaterThan(0)
    })

  createTest('collects only manual view metrics when trackViewMetricsManually is enabled')
    .withRum({ trackViewMetricsManually: true })
    .withRumSlim()
    .withBody(html`<button onclick="DD_RUM.setViewLoadingTime()">Set loading time</button>`)
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startView('manual loading time')
      })
      await page.getByRole('button', { name: 'Set loading time' }).click()

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents).toHaveLength(2)
      expect(viewEvents[0].view.loading_time).toBeUndefined()
      expect(viewEvents[1].view.loading_time).toBeGreaterThan(0)
      for (const viewEvent of viewEvents) {
        expect(viewEvent.view.time_spent).toBeGreaterThan(0)
        for (const metric of [
          'first_byte',
          'dom_complete',
          'dom_content_loaded',
          'dom_interactive',
          'load_event',
          'first_contentful_paint',
          'largest_contentful_paint',
          'cumulative_layout_shift',
          'interaction_to_next_paint',
        ]) {
          expect(viewEvent.view).not.toHaveProperty(metric)
        }
        expect(viewEvent.view.performance).toEqual({})
        expect(viewEvent.display?.scroll).toBeUndefined()
      }
    })

  test.describe('loading time', () => {
    // Simple spinner to test dom mutations.
    const SPINNER = html`
      <script type="module">
        const spinner = document.createElement('div')
        document.body.append(spinner)

        const spinnerChars = ['|', '/', '-', '\\\\']
        let i = 0
        setInterval(() => {
          spinner.innerText = spinnerChars[i]
          i = (i + 1) % spinnerChars.length
        }, 10)
      </script>
    `

    createTest('has a loading time')
      .withRum()
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent).toBeDefined()
        expect(viewEvent.view.loading_time).toBeGreaterThan(0)
      })

    createTest('does not have a loading time when DOM mutations are notified continuously')
      .withRum()
      .withBody(SPINNER)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents.at(-1)
        expect(viewEvent).toBeDefined()
        expect(viewEvent!.view.loading_time).toBeUndefined()
      })

    createTest('excludes some dom mutation when computing the loading time')
      .withRum({
        enableExperimentalFeatures: ['dom_mutation_ignoring'],
      })
      .withBody(html`
        <script type="module">
          document.body.setAttribute('data-dd-excluded-activity-mutations', 'true')
        </script>
        ${SPINNER}
      `)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent).toBeDefined()
        expect(viewEvent.view.loading_time).toBeGreaterThan(0)
      })

    createTest('has a manual loading time')
      .withRum()
      .withBody(SPINNER)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                window.DD_RUM!.setViewLoadingTime()
                resolve()
              }, 200)
            })
        )

        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents.at(-1)
        expect(viewEvent).toBeDefined()
        expect(viewEvent!.view.loading_time).toBeGreaterThanOrEqual(200 * 1e6)
      })

    createTest('overwrites manual loading time on subsequent calls (last-call-wins)')
      .withRum()
      .withBody(SPINNER)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(() => {
                window.DD_RUM!.setViewLoadingTime()
              }, 200)

              setTimeout(() => {
                window.DD_RUM!.setViewLoadingTime()
                resolve()
              }, 500)
            })
        )

        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents.at(-1)
        expect(viewEvent).toBeDefined()
        // Should reflect the second value (~500ms), not the first (~200ms)
        expect(viewEvent!.view.loading_time).toBeGreaterThanOrEqual(500 * 1e6)
      })

    createTest('reports manual loading time when called before init')
      .withRum()
      .withRumInit((configuration) => {
        window.DD_RUM!.setViewLoadingTime()
        window.DD_RUM!.init(configuration)
      })
      .withBody(SPINNER)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        const viewEvent = intakeRegistry.rumViewEvents.at(-1)
        expect(viewEvent).toBeDefined()
        expect(viewEvent!.view.loading_time).toBeGreaterThanOrEqual(0)
      })
  })

  test.describe('anchor navigation', () => {
    createTest("don't create a new view when it is an Anchor navigation")
      .withRum()
      .withBody(html`
        <a href="#test-anchor">anchor link</a>
        <div id="test-anchor"></div>
      `)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        const anchor = page.locator('a')
        await anchor.click()

        await flushEvents()
        const viewEvents = intakeRegistry.rumViewEvents

        expect(viewEvents).toHaveLength(1)
        expect(viewEvents[0].view.loading_type).toBe('initial_load')
      })

    createTest('create a new view on hash change')
      .withRum()
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await page.evaluate(() => {
          window.location.hash = '#bar'
        })

        await flushEvents()
        const viewEvents = intakeRegistry.rumViewEvents

        expect(viewEvents).toHaveLength(2)
        expect(viewEvents[0].view.loading_type).toBe('initial_load')
        expect(viewEvents[1].view.loading_type).toBe('route_change')
      })
  })
})
