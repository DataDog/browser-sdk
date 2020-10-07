import { createTest } from '../lib/createTest'
import { browserExecute, flushEvents } from '../lib/helpers'
import { bundleSetup } from '../lib/setups'

describe('internal monitoring', () => {
  createTest(
    'send errors',
    bundleSetup({
      logs: {
        internalMonitoringApiKey: 'xxx',
      },
    }),
    async ({ events }) => {
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
    }
  )
})
