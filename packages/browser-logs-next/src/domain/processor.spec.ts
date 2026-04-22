import { Pipeline } from '@datadog/core-next'
import type { LogsConfig } from './configuration'
import { startProcessor } from './processor'
import type { LogEvent } from './processor'

const defaultConfig: LogsConfig = {
  forwardErrorsToLogs: true,
  forwardConsoleLogs: ['log', 'debug', 'info', 'warn', 'error'],
  forwardReports: ['deprecation', 'intervention', 'csp-violation'],
}

function createPipelineAndCapture() {
  const pipeline = new Pipeline<Record<string, unknown>>()
  const observations: LogEvent[] = []
  pipeline.subscribe('observation:log', (event) => {
    observations.push(event as LogEvent)
  })
  return { pipeline, observations }
}

function waitMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('startProcessor', () => {
  it('transforms action:log into observation:log with origin=logger', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('action:log', { message: 'hello', status: 'info' })
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].message).toBe('hello')
    expect(observations[0].status).toBe('info')
    expect(observations[0].origin).toBe('logger')
  })

  it('transforms resource:console into observation:log with origin=console', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:console', { api: 'log', message: 'console message' })
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].message).toBe('console message')
    expect(observations[0].origin).toBe('console')
  })

  it('maps console.warn to status=warn', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:console', { api: 'warn', message: 'a warning' })
    await waitMicrotask()

    expect(observations[0].status).toBe('warn')
  })

  it('maps console.error to status=error', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:console', { api: 'error', message: 'an error' })
    await waitMicrotask()

    expect(observations[0].status).toBe('error')
  })

  it('transforms resource:runtime_error into observation:log with origin=source and status=error', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:runtime_error', {
      message: 'ReferenceError: foo is not defined',
      type: 'ReferenceError',
      stack: 'ReferenceError: foo is not defined\n  at ...',
      source: 'source',
    })
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].origin).toBe('source')
    expect(observations[0].status).toBe('error')
    expect(observations[0].message).toBe('ReferenceError: foo is not defined')
    expect((observations[0].error as any).kind).toBe('ReferenceError')
  })

  it('transforms resource:network_request with status 500 into observation:log with origin=network', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:network_request', {
      method: 'GET',
      url: 'https://example.com/api',
      status: 500,
      isAborted: false,
      duration: 100,
    })
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].origin).toBe('network')
    expect(observations[0].status).toBe('error')
    expect((observations[0].http as any).status_code).toBe(500)
  })

  it('skips resource:network_request with status 200 (not an error)', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:network_request', {
      method: 'GET',
      url: 'https://example.com/api',
      status: 200,
      isAborted: false,
      duration: 100,
    })
    await waitMicrotask()

    expect(observations.length).toBe(0)
  })

  it('transforms resource:report into observation:log with origin=report', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('resource:report', {
      type: 'deprecation',
      message: 'Deprecated API used',
    })
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].origin).toBe('report')
    expect(observations[0].message).toBe('Deprecated API used')
  })

  it('enriches with view URL (window.location.href)', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    startProcessor({ pipeline, config: defaultConfig })
    pipeline.seal()

    pipeline.publish('action:log', { message: 'test', status: 'info' })
    await waitMicrotask()

    expect(observations[0].view).toEqual({ url: window.location.href })
  })

  it('respects forwardErrorsToLogs: false — no runtime_error or network_request subscriptions', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    const config: LogsConfig = { ...defaultConfig, forwardErrorsToLogs: false }
    startProcessor({ pipeline, config })
    pipeline.seal()

    pipeline.publish('resource:runtime_error', {
      message: 'ignored error',
      source: 'source',
    })
    pipeline.publish('resource:network_request', {
      method: 'GET',
      url: 'https://example.com/api',
      status: 500,
      isAborted: false,
      duration: 100,
    })
    await waitMicrotask()

    expect(observations.length).toBe(0)
  })

  it('respects forwardConsoleLogs filter — only forwards matching APIs', async () => {
    const { pipeline, observations } = createPipelineAndCapture()
    const config: LogsConfig = { ...defaultConfig, forwardConsoleLogs: ['error'] }
    startProcessor({ pipeline, config })
    pipeline.seal()

    pipeline.publish('resource:console', { api: 'log', message: 'not forwarded' })
    pipeline.publish('resource:console', { api: 'warn', message: 'not forwarded' })
    pipeline.publish('resource:console', { api: 'error', message: 'forwarded' })
    await waitMicrotask()

    expect(observations.length).toBe(1)
    expect(observations[0].message).toBe('forwarded')
  })
})
