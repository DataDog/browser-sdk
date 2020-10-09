import { browserExecute } from '../lib/browserHelpers'
import { flushEvents } from '../lib/sdkHelpers'
import { bundleSetup, createTest } from '../lib/testSetup'

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
