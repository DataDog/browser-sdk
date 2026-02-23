import { test, expect } from '@playwright/test'
import { createTest, html, waitForServersIdle, waitForRequests } from '../../lib/framework'

function hasActionId(event: { action?: { id?: string | string[] } }, actionId: string): boolean {
  return [event.action?.id].flat().includes(actionId)
}

test.describe('action collection', () => {
  createTest('track a click action')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          button.setAttribute('data-clicked', 'true')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0]).toEqual(
        expect.objectContaining({
          action: {
            error: {
              count: 0,
            },
            id: expect.any(String),
            loading_time: expect.any(Number),
            long_task: {
              count: expect.any(Number),
            },
            resource: {
              count: 0,
            },
            target: {
              name: 'click me',
            },
            type: 'click',
            frustration: {
              type: [],
            },
          },
          _dd: expect.objectContaining({
            action: {
              target: expect.objectContaining({
                selector: expect.any(String),
                width: expect.any(Number),
                height: expect.any(Number),
              }),
              name_source: 'text_content',
              position: {
                x: expect.any(Number),
                y: expect.any(Number),
              },
            },
          }),
        })
      )
    })

  createTest('compute action target information before the UI changes')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button style="position: relative">click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('pointerdown', () => {
          // Using .textContent or .innerText prevents the click event to be dispatched in Safari
          button.childNodes[0].data = 'Clicked'
          button.classList.add('active')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action?.target?.name).toBe('click me')
      expect(actionEvents[0]._dd.action?.target?.selector).toBe('BODY>BUTTON')
    })

  createTest('does not report a click on the body when the target element changes between mousedown and mouseup')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button style="position: relative">click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('pointerdown', () => {
          // Move the button to the right, so the mouseup/pointerup event target is different
          // than the <button> element and click event target gets set to <body>
          button.style.left = '1000px'
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action?.target?.name).toBe('click me')
    })

  createTest('associate a request to its action')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          fetch('/ok')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await waitForServersIdle()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents
      const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'fetch')

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action).toEqual({
        error: {
          count: 0,
        },
        id: expect.any(String) as unknown as string,
        loading_time: expect.any(Number) as unknown as number,
        long_task: {
          count: expect.any(Number) as unknown as number,
        },
        resource: {
          count: 1,
        },
        target: {
          name: 'click me',
        },
        type: 'click',
        frustration: {
          type: [],
        },
      })

      expect(resourceEvents).toHaveLength(1)
      // resource action id should contain the collected action id + the discarded rage click id
      expect(resourceEvents[0].action!.id).toHaveLength(2)
      expect(resourceEvents[0].action!.id).toContain(actionEvents[0].action.id!)
    })

  createTest('associate a long tasks to its action')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          const end = performance.now() + 55
          while (performance.now() < end) {} // block the handler for ~55ms to trigger a long task
          fetch('/ok') // fire a fetch to extend the action duration
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Non-Chromium browsers do not support long tasks')

      const button = page.locator('button')
      await button.click()
      await waitForServersIdle()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents
      const longTaskEvents = intakeRegistry.rumLongTaskEvents.filter((event) =>
        event.long_task.scripts?.[0]?.invoker?.includes('BUTTON.onclick')
      )

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action).toEqual({
        error: {
          count: 0,
        },
        id: expect.any(String) as unknown as string,
        loading_time: expect.any(Number),
        long_task: {
          count: 1,
        },

        resource: {
          count: expect.any(Number) as unknown as number,
        },
        target: {
          name: 'click me',
        },
        type: 'click',
        frustration: {
          type: [],
        },
      })

      expect(longTaskEvents).toHaveLength(1)
      // long task action id should contain the collected action id + the discarded rage click id
      expect(longTaskEvents[0].action!.id).toHaveLength(2)
      expect(longTaskEvents[0].action!.id).toContain(actionEvents[0].action.id!)
    })

  createTest('increment the view.action.count of the view active when the action started')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          history.pushState(null, null, '/other-view')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)

      const viewEvents = intakeRegistry.rumViewEvents
      const originalViewEvent = viewEvents.find((view) => view.view.url.endsWith('/'))!
      const otherViewEvent = viewEvents.find((view) => view.view.url.endsWith('/other-view'))!
      expect(originalViewEvent.view.action.count).toBe(1)
      expect(otherViewEvent.view.action.count).toBe(0)
    })

  createTest('collect an "error click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          button.setAttribute('data-clicked', 'true')
          throw new Error('Foo')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, withBrowserLogs, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['error_click'])
      expect(actionEvents[0].action.error!.count).toBe(1)

      expect(intakeRegistry.rumViewEvents[0].view.frustration!.count).toBe(1)

      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  createTest('collect a "dead click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <button>click me</button> `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['dead_click'])

      expect(intakeRegistry.rumViewEvents[0].view.frustration!.count).toBe(1)
    })

  createTest('do not consider a click on a checkbox as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="checkbox" /> `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const input = page.locator('input')
      await input.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('do not consider a click to change the value of a "range" input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="range" /> `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const input = page.locator('input')
      await input.click({ position: { x: 10, y: 0 } })
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('consider a click on an already checked "radio" input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="radio" checked /> `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const input = page.locator('input')
      await input.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['dead_click'])
    })

  createTest('do not consider a click on text input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="text" /> `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const input = page.locator('input')
      await input.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('do not consider a click on a label referring to a text input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="text" id="my-input" /><label for="my-input">Click me</label> `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const label = page.locator('label')
      await label.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('do not consider clicks leading to scrolls as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <div style="height: 200vh;">
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            window.scrollTo(0, 200)
          })
        </script>
      </div>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('do not consider clicks leading to scrolls as "rage_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <div style="height: 200vh;">
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            window.scrollTo(0, 200)
          })
        </script>
      </div>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()
      await button.click()
      await button.click()

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(3)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('do not consider a click that open a new window as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          window.open(window.location.href)
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('button')
      await button.click()

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toHaveLength(0)
    })

  createTest('collect a "rage click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          button.setAttribute('data-clicked', Math.random())
        })
      </script>
    `)
    .run(async ({ intakeRegistry, page, flushEvents }) => {
      // We don't use the playwright's `page.locator('button').click()` here because the latency of the command is
      // too high and the clicks won't be recognised as rage clicks.
      await page.evaluate(() => {
        const button = document.querySelector('button')!

        function click() {
          button.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true }))
          button.dispatchEvent(new PointerEvent('pointerup', { isPrimary: true }))
          button.dispatchEvent(new PointerEvent('click', { isPrimary: true }))
        }

        // Simulate a rage click
        click()
        click()
        click()
      })

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['rage_click'])
    })

  createTest('collect multiple frustrations in one action')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          throw new Error('Foo')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, withBrowserLogs, page }) => {
      const button = page.locator('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.frustration!.type).toStrictEqual(['error_click', 'dead_click'])

      expect(intakeRegistry.rumViewEvents[0].view.frustration!.count).toBe(2)

      withBrowserLogs((browserLogs) => {
        expect(browserLogs).toHaveLength(1)
      })
    })

  // We don't use the playwright's `page.locator('button').click()` here because it makes the test slower
  createTest('dont crash when clicking on a button')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        function click() {
          const down = new PointerEvent('pointerdown', { isPrimary: true })
          down.__ddIsTrusted = true

          const up = new PointerEvent('pointerup', { isPrimary: true })
          up.__ddIsTrusted = true

          button.dispatchEvent(down)
          button.dispatchEvent(up)
        }

        for (let i = 0; i < 2_500; i++) {
          click()
        }

        window.open('/empty')
      </script>
    `)
    .run(({ withBrowserLogs }) => {
      withBrowserLogs((logs) => {
        // A failing test would have a log with message "Uncaught RangeError: Maximum call stack size exceeded"
        expect(logs).toHaveLength(0)
      })
    })
})

test.describe('action collection with shadow DOM', () => {
  createTest('without betaTrackActionsInShadowDom, click inside shadow DOM uses shadow host as target')
    .withRum({ trackUserInteractions: true })
    .withBody(html`
      <my-button id="shadow-host"></my-button>
      <script>
        class MyButton extends HTMLElement {
          constructor() {
            super()
            this.attachShadow({ mode: 'open' })
            const button = document.createElement('button')
            button.textContent = 'Shadow Button'
            this.shadowRoot.appendChild(button)
          }
        }
        customElements.define('my-button', MyButton)
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('my-button').first().locator('button')
      await button.click()
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action?.target?.name).toBe('')
      expect(actionEvents[0]._dd.action?.target?.selector).toBe('#shadow-host')
    })

  createTest('with betaTrackActionsInShadowDom, get action name from element inside shadow DOM')
    .withRum({ trackUserInteractions: true, betaTrackActionsInShadowDom: true })
    .withBody(html`
      <my-button id="shadow-host"></my-button>
      <script>
        class MyButton extends HTMLElement {
          constructor() {
            super()
            this.attachShadow({ mode: 'open' })
            const button = document.createElement('button')
            button.textContent = 'Shadow Button'
            this.shadowRoot.appendChild(button)
          }
        }
        customElements.define('my-button', MyButton)
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('my-button').first().locator('button')
      await button.click()
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action?.target?.name).toBe('Shadow Button')
      expect(actionEvents[0]._dd.action?.target?.selector).toEqual('#shadow-host::shadow BUTTON')
    })

  createTest('with betaTrackActionsInShadowDom, traverse shadow boundary for data-dd-action-name')
    .withRum({ trackUserInteractions: true, betaTrackActionsInShadowDom: true })
    .withBody(html`
      <my-button id="shadow-host" data-dd-action-name="Custom Shadow Action"></my-button>
      <script>
        class MyButton extends HTMLElement {
          constructor() {
            super()
            this.attachShadow({ mode: 'open' })
            const button = document.createElement('button')
            button.textContent = 'Click me'
            this.shadowRoot.appendChild(button)
          }
        }
        customElements.define('my-button', MyButton)
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('my-button').first().locator('button')
      await button.click()
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action?.target?.name).toBe('Custom Shadow Action')
    })

  createTest('with betaTrackActionsInShadowDom, selector includes stable attributes from inside shadow DOM')
    .withRum({ trackUserInteractions: true, betaTrackActionsInShadowDom: true })
    .withBody(html`
      <my-button id="shadow-host"></my-button>
      <script>
        class MyButton extends HTMLElement {
          constructor() {
            super()
            this.attachShadow({ mode: 'open' })
            const button = document.createElement('button')
            button.setAttribute('data-testid', 'shadow-btn')
            button.textContent = 'Test Button'
            this.shadowRoot.appendChild(button)
          }
        }
        customElements.define('my-button', MyButton)
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const button = page.locator('my-button').first().locator('button')
      await button.click()
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0]._dd.action?.target?.selector).toEqual(
        '#shadow-host::shadow BUTTON[data-testid="shadow-btn"]'
      )
    })
})

test.describe('custom actions with startAction/stopAction', () => {
  createTest('track a custom action with startAction/stopAction')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startAction('checkout')
        window.DD_RUM!.stopAction('checkout')
      })
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.target?.name).toBe('checkout')
      expect(actionEvents[0].action.type).toBe('custom')
      expect(actionEvents[0].action.id).toBeDefined()
    })

  createTest('associate an error to a custom action')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startAction('checkout')
        window.DD_RUM!.addError(new Error('Payment failed'))
        window.DD_RUM!.stopAction('checkout')
      })
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      const errorEvents = intakeRegistry.rumErrorEvents

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.error?.count).toBe(1)
      expect(actionEvents[0].action.frustration?.type).toContain('error_click')
      expect(errorEvents.length).toBeGreaterThanOrEqual(1)

      const actionId = actionEvents[0].action.id
      const relatedError = errorEvents.find((e) => hasActionId(e, actionId!))
      expect(relatedError).toBeDefined()
    })

  createTest('associate a resource to a custom action')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startAction('load-data')
        void fetch('/ok')
      })
      await waitForRequests(page)
      await page.evaluate(() => {
        window.DD_RUM!.stopAction('load-data')
      })
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      const resourceEvents = intakeRegistry.rumResourceEvents.filter((e) => e.resource.type === 'fetch')

      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.resource?.count).toBe(1)
      expect(actionEvents[0].action.frustration?.type).toEqual([])

      const actionId = actionEvents[0].action.id
      const relatedResource = resourceEvents.find((e) => hasActionId(e, actionId!))
      expect(relatedResource).toBeDefined()
    })

  createTest('track multiple concurrent custom actions with actionKey')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startAction('click', { actionKey: 'button1' })
        window.DD_RUM!.startAction('click', { actionKey: 'button2' })
        window.DD_RUM!.stopAction('click', { actionKey: 'button2' })
        window.DD_RUM!.stopAction('click', { actionKey: 'button1' })
      })
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(2)
      expect(actionEvents[0].action.id).not.toBe(actionEvents[1].action.id)
    })

  createTest('merge contexts from start and stop')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startAction('purchase', { context: { cart_id: 'abc123' } })
        window.DD_RUM!.stopAction('purchase', { context: { total: 99.99 } })
      })
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].context).toEqual(
        expect.objectContaining({
          cart_id: 'abc123',
          total: 99.99,
        })
      )
    })

  createTest('preserve timing when startAction is called before init')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .withRumInit((configuration) => {
      window.DD_RUM!.startAction('pre_init_action')

      setTimeout(() => {
        window.DD_RUM!.init(configuration)
        window.DD_RUM!.stopAction('pre_init_action')
      }, 50)
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)
      expect(actionEvents[0].action.target?.name).toBe('pre_init_action')
      expect(actionEvents[0].action.loading_time).toBeGreaterThanOrEqual(40 * 1e6)
    })

  createTest('attribute errors and resources to action started before init')
    .withRum({ enableExperimentalFeatures: ['start_stop_action'] })
    .withRumInit((configuration) => {
      window.DD_RUM!.startAction('pre_init_action')

      setTimeout(() => {
        window.DD_RUM!.init(configuration)

        window.DD_RUM!.addError(new Error('Test error'))
        void fetch('/ok')
      }, 10)
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await waitForRequests(page)

      await page.evaluate(() => {
        window.DD_RUM!.stopAction('pre_init_action')
      })

      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents).toHaveLength(1)

      const actionId = actionEvents[0].action.id
      const relatedError = intakeRegistry.rumErrorEvents.find((e) => hasActionId(e, actionId!))
      expect(relatedError).toBeDefined()

      const fetchResources = intakeRegistry.rumResourceEvents.filter((e) => e.resource.type === 'fetch')
      const relatedFetch = fetchResources.find((e) => hasActionId(e, actionId!))
      expect(relatedFetch).toBeDefined()
    })
})
