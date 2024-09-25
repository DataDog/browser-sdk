import { getBrowserName, withBrowserLogs } from '../../lib/helpers/browser'
import { createTest, flushEvents, html, waitForServersIdle } from '../../lib/framework'

describe('action collection', () => {
  createTest('track a click action')
    .withRum({ trackUserInteractions: true, enableExperimentalFeatures: ['action_name_masking'] })
    .withBody(html`
      <button>click me</button>
      <script>
        const button = document.querySelector('button')
        button.addEventListener('click', () => {
          button.setAttribute('data-clicked', 'true')
        })
      </script>
    `)
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0]).toEqual(
        jasmine.objectContaining({
          action: {
            error: {
              count: 0,
            },
            id: jasmine.any(String),
            loading_time: jasmine.any(Number),
            long_task: {
              count: jasmine.any(Number),
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
          _dd: jasmine.objectContaining({
            action: {
              target: jasmine.objectContaining({
                selector: jasmine.any(String),
                width: jasmine.any(Number),
                height: jasmine.any(Number),
              }),
              name_source: 'text_content',
              position: {
                x: jasmine.any(Number),
                y: jasmine.any(Number),
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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action?.target?.name).toBe('click me')
      expect(actionEvents[0]._dd.action?.target?.selector).toBe('BODY>BUTTON')
    })

  // When the target element changes between mousedown and mouseup, Firefox does not dispatch a
  // click event. Skip this test.
  if (getBrowserName() !== 'firefox') {
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
      .run(async ({ intakeRegistry }) => {
        const button = $('button')
        await button.click()
        await flushEvents()
        const actionEvents = intakeRegistry.rumActionEvents

        expect(actionEvents.length).toBe(1)
        expect(actionEvents[0].action?.target?.name).toBe('click me')
      })
  }

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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await waitForServersIdle()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents
      const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'fetch')

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action).toEqual({
        error: {
          count: 0,
        },
        id: jasmine.any(String) as unknown as string,
        loading_time: jasmine.any(Number) as unknown as number,
        long_task: {
          count: jasmine.any(Number) as unknown as number,
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

      expect(resourceEvents.length).toBe(1)
      // resource action id should contain the collected action id + the discarded rage click id
      expect(resourceEvents[0].action!.id.length).toBe(2)
      expect(resourceEvents[0].action!.id).toContain(actionEvents[0].action.id!)
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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents
      expect(actionEvents.length).toBe(1)

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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['error_click'])
      expect(actionEvents[0].action.error!.count).toBe(1)

      expect(intakeRegistry.rumViewEvents[0].view.frustration!.count).toBe(1)

      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('collect a "dead click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <button>click me</button> `)
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['dead_click'])

      expect(intakeRegistry.rumViewEvents[0].view.frustration!.count).toBe(1)
    })

  createTest('do not consider a click on a checkbox as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="checkbox" /> `)
    .run(async ({ intakeRegistry }) => {
      const input = $('input')
      await input.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual([])
    })

  createTest('do not consider a click to change the value of a "range" input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="range" /> `)
    .run(async ({ intakeRegistry }) => {
      const input = $('input')
      await input.click({ x: 10 })
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual([])
    })

  createTest('consider a click on an already checked "radio" input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="radio" checked /> `)
    .run(async ({ intakeRegistry }) => {
      const input = $('input')
      await input.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(['dead_click'])
    })

  createTest('do not consider a click on text input as "dead_click"')
    .withRum({ trackUserInteractions: true })
    .withBody(html` <input type="text" /> `)
    .run(async ({ intakeRegistry }) => {
      const input = $('input')
      await input.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual([])
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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual([])
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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await Promise.all([button.click(), button.click(), button.click()])

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(3)
      expect(actionEvents[0].action.frustration!.type).toEqual([])
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
    .run(async ({ intakeRegistry }) => {
      const windowHandle = await browser.getWindowHandle()
      const button = $('button')
      await button.click()
      // Ideally, we would close the newly created window. But on Safari desktop (at least), it is
      // not possible to do so: calling `browser.closeWindow()` is failing with "no such window:
      // unknown error". Instead, just switch back to the original window.
      await browser.switchToWindow(windowHandle)

      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual([])
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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await Promise.all([button.click(), button.click(), button.click()])
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
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
    .run(async ({ intakeRegistry }) => {
      const button = $('button')
      await button.click()
      await flushEvents()
      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration!.type).toEqual(
        jasmine.arrayWithExactContents(['error_click', 'dead_click'])
      )

      expect(intakeRegistry.rumViewEvents[0].view.frustration!.count).toBe(2)

      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  // We don't use the wdio's `$('button').click()` here because it makes the test slower
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

        window.open('foo')
      </script>
    `)
    .run(async () => {
      await withBrowserLogs((logs) => {
        // A failing test would have a log with message "Uncaught RangeError: Maximum call stack size exceeded"
        expect(logs).toEqual([])
      })
    })
})
