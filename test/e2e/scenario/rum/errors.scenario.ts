import { createTest } from '../../lib/framework'
import { browserExecute, withBrowserLogs } from '../../lib/helpers/browser'
import { flushEvents } from '../../lib/helpers/sdk'

describe('rum errors', () => {
  createTest('send errors')
    .withRum()
    .run(async ({ events }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(events.rumErrors.length).toBe(1)
      expect(events.rumErrors[0].message).toBe('console error: oh snap')
      expect(events.rumErrors[0].error.origin).toBe('console')
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })
})
