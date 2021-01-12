import { bundleSetup, createTest } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'

describe('internal monitoring', () => {
  createTest('send errors')
    .withSetup(bundleSetup)
    .withLogs({
      internalMonitoringApiKey: 'xxx',
    })
    .run(async ({ events }) => {
      await browserExecute(() => {
        const context = {
          get foo() {
            throw new window.Error('bar')
          },
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        window.DD_LOGS!.logger.log('hop', context as any)
      })
      await flushEvents()
      expect(events.internalMonitoring.length).toBe(1)
      const event = events.internalMonitoring[0]
      expect(event.message).toBe('bar')
      expect(event.error.kind).toBe('Error')
      expect(event.status).toBe('error')
      events.empty()
    })
})
