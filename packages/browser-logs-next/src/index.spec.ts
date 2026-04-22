import { Pipeline, connectBridges } from '@datadog/core-next'
import { datadogLogs } from './index'

function waitMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('logs bridge (datadogLogs)', () => {
  it('datadogLogs.logger is a Logger instance with expected methods', () => {
    expect(datadogLogs.logger).toBeDefined()
    expect(typeof datadogLogs.logger.info).toBe('function')
    expect(typeof datadogLogs.logger.error).toBe('function')
    expect(typeof datadogLogs.logger.debug).toBe('function')
  })

  it('datadogLogs.createLogger returns a new Logger', () => {
    const logger = datadogLogs.createLogger('my-logger')
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
  })

  it('logs published before connect are buffered and flushed on connect', async () => {
    // Create a fresh pipeline that hasn't been connected yet
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:log', (event) => {
      received.push(event)
    })

    // Log before connecting the bridge — should be buffered
    datadogLogs.logger.info('buffered message')

    // No events yet since pipeline isn't sealed/connected
    expect(received.length).toBe(0)

    // Connect bridges — flushes the pending buffer
    connectBridges(pipeline)
    pipeline.seal()
    await waitMicrotask()

    expect(received.length).toBeGreaterThanOrEqual(1)
    const logEvent = received[received.length - 1] as any
    expect(logEvent.message).toBe('buffered message')
  })

  it('logs published after connect are sent directly to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:log', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    datadogLogs.logger.info('direct message')
    await waitMicrotask()

    const directEvent = received.find((e: any) => e.message === 'direct message') as any
    expect(directEvent).toBeDefined()
    expect(directEvent.status).toBe('info')
  })
})
