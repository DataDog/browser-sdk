import { withBrowserLogs } from '../../lib/helpers/browser'
import { createTest, html, waitForServersIdle } from '../../lib/framework'
import { flushEvents } from '../../lib/helpers/flushEvents'

describe('action collection', () => {
  createTest('track a click action')
    .withRum({ trackInteractions: true })
    .withBody(
      html`
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            button.setAttribute('data-clicked', 'true')
          })
        </script>
      `
    )
    .run(async ({ serverEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()
      const actionEvents = serverEvents.rumActions

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
          count: 0,
        },
        target: {
          name: 'click me',
        },
        type: 'click',
        frustration_type: [],
      })
    })

  createTest('associate a request to its action')
    .withRum({ trackInteractions: true })
    .withBody(
      html`
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            fetch('/ok')
          })
        </script>
      `
    )
    .run(async ({ serverEvents }) => {
      const button = await $('button')
      await button.click()
      await waitForServersIdle()
      await flushEvents()
      const actionEvents = serverEvents.rumActions
      const resourceEvents = serverEvents.rumResources.filter((event) => event.resource.type === 'fetch')

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
        frustration_type: [],
      })

      expect(resourceEvents.length).toBe(1)
      expect(resourceEvents[0].action!.id).toBe(actionEvents[0].action.id!)
    })

  createTest('collect an "error click"')
    .withRum({ trackInteractions: true, enableExperimentalFeatures: ['frustration-signals'] })
    .withBody(
      html`
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            button.setAttribute('data-clicked', 'true')
            throw new Error('Foo')
          })
        </script>
      `
    )
    .run(async ({ serverEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()
      const actionEvents = serverEvents.rumActions

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration_type).toEqual(['error'])
      expect(actionEvents[0].action.error!.count).toBe(1)
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })

  createTest('collect a "dead click"')
    .withRum({ trackInteractions: true, enableExperimentalFeatures: ['frustration-signals'] })
    .withBody(html` <button>click me</button> `)
    .run(async ({ serverEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()
      const actionEvents = serverEvents.rumActions

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration_type).toEqual(['dead'])
    })

  createTest('collect multiple frustrations in one action')
    .withRum({ trackInteractions: true, enableExperimentalFeatures: ['frustration-signals'] })
    .withBody(
      html`
        <button>click me</button>
        <script>
          const button = document.querySelector('button')
          button.addEventListener('click', () => {
            throw new Error('Foo')
          })
        </script>
      `
    )
    .run(async ({ serverEvents }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()
      const actionEvents = serverEvents.rumActions

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].action.frustration_type).toEqual(jasmine.arrayWithExactContents(['error', 'dead']))
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })
})
