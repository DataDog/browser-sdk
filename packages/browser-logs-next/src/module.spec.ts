import { Pipeline } from '@datadog/core-next'
import type { LogEvent } from './domain/processor'
import { logsModule } from './module'
import type { LogsPublicApi } from './module'

function createTestContext() {
  const pipeline = new Pipeline<Record<string, unknown>>()
  const session = {
    getId: () => 'test-session',
    getDeviceId: () => 'test-device',
    isExpired: () => false,
    touch: async () => {},
    expire: async () => {},
    renew: async () => {},
    on: () => {},
  } as any

  const config = {
    clientToken: 'test',
    site: 'datadoghq.com',
    enabled: true,
    sessionSampleRate: 100,
    telemetrySampleRate: 20,
    telemetryConfigurationSampleRate: 5,
    telemetryUsageSampleRate: 5,
    logs: {
      forwardErrorsToLogs: true,
      forwardConsoleLogs: ['log', 'debug', 'info', 'warn', 'error'],
      forwardReports: [],
    },
  }

  return { pipeline, session, config }
}

function waitMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function initModule(context: {
  pipeline: Pipeline<Record<string, unknown>>
  session: any
  config: any
}): LogsPublicApi {
  return logsModule.init(context as any) as unknown as LogsPublicApi
}

describe('logsModule', () => {
  it('init returns a public API with a logger property', () => {
    const { pipeline, session, config } = createTestContext()
    const api = initModule({ pipeline, session, config })

    expect(api.logger).toBeDefined()
  })

  it('logger.info publishes action:log which is transformed to observation:log', async () => {
    const { pipeline, session, config } = createTestContext()
    const observations: LogEvent[] = []

    pipeline.subscribe('observation:log', (event) => {
      observations.push(event as LogEvent)
    })

    const api = initModule({ pipeline, session, config })
    pipeline.seal()

    api.logger.info('test message')
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].message).toBe('test message')
    expect(observations[0].status).toBe('info')
  })

  it('createLogger creates a named logger that can send logs', async () => {
    const { pipeline, session, config } = createTestContext()
    const observations: LogEvent[] = []

    pipeline.subscribe('observation:log', (event) => {
      observations.push(event as LogEvent)
    })

    const api = initModule({ pipeline, session, config })
    pipeline.seal()

    const myLogger = api.createLogger('my-service')
    myLogger.info('from named logger')
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].message).toBe('from named logger')
    expect(observations[0].logger).toEqual({ name: 'my-service' })
  })

  it('getLogger retrieves a previously created logger', () => {
    const { pipeline, session, config } = createTestContext()
    const api = initModule({ pipeline, session, config })
    pipeline.seal()

    api.createLogger('my-service')
    const retrieved = api.getLogger('my-service')

    expect(retrieved).toBeDefined()
  })

  it('getLogger returns undefined for unknown names', () => {
    const { pipeline, session, config } = createTestContext()
    const api = initModule({ pipeline, session, config })
    pipeline.seal()

    const result = api.getLogger('unknown')

    expect(result).toBeUndefined()
  })
})
