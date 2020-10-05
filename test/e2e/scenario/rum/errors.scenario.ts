import { createTest } from '../../lib/createTest'
import { browserExecute, flushEvents, withBrowserLogs } from '../../lib/helpers'
import { allSetups } from '../../lib/setups'

describe('rum errors', () => {
  createTest('send errors', allSetups({ rum: {} }), async ({ events }) => {
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
