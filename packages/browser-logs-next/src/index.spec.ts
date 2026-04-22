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

  it('createLogger produces a logger that sends events through the connected pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:log', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    const customLogger = datadogLogs.createLogger('service-logger')
    customLogger.warn('custom warn message')
    await waitMicrotask()

    const event = received.find((e: any) => e.message === 'custom warn message') as any
    expect(event).toBeDefined()
    expect(event.status).toBe('warn')
    expect(event.loggerName).toBe('service-logger')
  })
})
