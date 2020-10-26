import { createTest, html, waitForServersIdle } from '../../lib/framework'
import { flushEvents } from '../../lib/helpers/sdk'

describe('action collection', () => {
  createTest('track a click action')
    .withRum({ trackInteractions: true })
    .withBody(
      html`
        <button>click me</button>
        <script>
          const btn = document.querySelector('button')
          btn.addEventListener('click', () => {
            btn.setAttribute('data-clicked', 'true')
          })
        </script>
      `
    )
    .run(async ({ events }) => {
      const button = await $('button')
      await button.click()
      await flushEvents()
      const actionEvents = events.rumActions

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].user_action).toEqual({
        id: (jasmine.any(String) as unknown) as string,
        measures: {
          error_count: 0,
          long_task_count: (jasmine.any(Number) as unknown) as number,
          resource_count: 0,
        },
        type: 'click',
      })
      expect(actionEvents[0].evt.name).toBe('click me')
      expect(actionEvents[0].duration).toBeGreaterThanOrEqual(0)
    })

  createTest('associate a request to its action')
    .withRum({ trackInteractions: true })
    .withBody(
      html`
        <button>click me</button>
        <script>
          const btn = document.querySelector('button')
          btn.addEventListener('click', () => {
            fetch('/ok')
          })
        </script>
      `
    )
    .run(async ({ events }) => {
      const button = await $('button')
      await button.click()
      await waitForServersIdle()
      await flushEvents()
      const actionEvents = events.rumActions
      const resourceEvents = events.rumResources.filter((event) => event.resource.kind === 'fetch')

      expect(actionEvents.length).toBe(1)
      expect(actionEvents[0].user_action).toEqual({
        id: (jasmine.any(String) as unknown) as string,
        measures: {
          error_count: 0,
          long_task_count: (jasmine.any(Number) as unknown) as number,
          resource_count: 1,
        },
        type: 'click',
      })
      expect(actionEvents[0].evt.name).toBe('click me')
      expect(actionEvents[0].duration).toBeGreaterThan(0)

      expect(resourceEvents.length).toBe(1)
      expect(resourceEvents[0].user_action!.id).toBe(actionEvents[0].user_action.id!)
    })
})
