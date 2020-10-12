import { createTest, html, waitForServersIdle } from '../../lib/framework'
import { flushEvents } from '../../lib/sdkHelpers'

describe('user action collection', () => {
  createTest('track a click user action')
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
      const userActionEvents = events.rumActions

      expect(userActionEvents.length).toBe(1)
      expect(userActionEvents[0].user_action).toEqual({
        id: (jasmine.any(String) as unknown) as string,
        measures: {
          error_count: 0,
          long_task_count: (jasmine.any(Number) as unknown) as number,
          resource_count: 0,
        },
        type: 'click',
      })
      expect(userActionEvents[0].evt.name).toBe('click me')
      expect(userActionEvents[0].duration).toBeGreaterThanOrEqual(0)
    })

  createTest('associate a request to its user action')
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
      const userActionEvents = events.rumActions
      const resourceEvents = events.rumResources.filter((event) => event.resource.kind === 'fetch')

      expect(userActionEvents.length).toBe(1)
      expect(userActionEvents[0].user_action).toEqual({
        id: (jasmine.any(String) as unknown) as string,
        measures: {
          error_count: 0,
          long_task_count: (jasmine.any(Number) as unknown) as number,
          resource_count: 1,
        },
        type: 'click',
      })
      expect(userActionEvents[0].evt.name).toBe('click me')
      expect(userActionEvents[0].duration).toBeGreaterThan(0)

      expect(resourceEvents.length).toBe(1)
      expect(resourceEvents[0].user_action!.id).toBe(userActionEvents[0].user_action.id!)
    })
})
