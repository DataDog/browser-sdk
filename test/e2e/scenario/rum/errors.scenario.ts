import { createTest } from '../../lib/framework'
import { browserExecute, withBrowserLogs } from '../../lib/helpers/browser'
import { flushEvents } from '../../lib/helpers/flushEvents'

describe('rum errors', () => {
  createTest('send console.error errors')
    .withRum()
    .run(async ({ serverEvents }) => {
      await browserExecute(() => {
        console.error('oh snap')
      })
      await flushEvents()
      expect(serverEvents.rumErrors.length).toBe(1)
      expect(serverEvents.rumErrors[0].error.message).toBe('console error: oh snap')
      expect(serverEvents.rumErrors[0].error.source).toBe('console')
      await withBrowserLogs((browserLogs) => {
        expect(browserLogs.length).toEqual(1)
      })
    })
})
