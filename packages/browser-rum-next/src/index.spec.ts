import { Pipeline, connectBridges } from '@datadog/core-next'
import { datadogRum } from './index'

function waitMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('rum bridge (datadogRum)', () => {
  it('datadogRum exposes startView, addError, and addAction', () => {
    expect(typeof datadogRum.startView).toBe('function')
    expect(typeof datadogRum.addError).toBe('function')
    expect(typeof datadogRum.addAction).toBe('function')
  })

  it('actions published before connect are buffered and flushed on connect', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_action', (event) => {
      received.push(event)
    })

    // Publish before connecting — should buffer
    datadogRum.addAction('buffered-action', { from: 'pre-init' })

    expect(received.length).toBe(0)

    connectBridges(pipeline)
    pipeline.seal()
    await waitMicrotask()

    const action = received.find((e: any) => e.name === 'buffered-action') as any
    expect(action).toBeDefined()
    expect(action.context).toEqual({ from: 'pre-init' })
  })

  it('actions published after connect are sent directly to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_action', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    datadogRum.addAction('post-init-action')
    await waitMicrotask()

    const action = received.find((e: any) => e.name === 'post-init-action') as any
    expect(action).toBeDefined()
  })

  it('addError with Error object buffers and flushes action:add_error', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_error', (event) => {
      received.push(event)
    })

    const err = new Error('test rum error')
    datadogRum.addError(err, { extra: 'info' })

    connectBridges(pipeline)
    pipeline.seal()
    await waitMicrotask()

    const errorEvent = received.find((e: any) => e.error?.message === 'test rum error') as any
    expect(errorEvent).toBeDefined()
    expect(errorEvent.context).toEqual({ extra: 'info' })
  })

  it('addError with string converts to Error object', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_error', (event) => {
      received.push(event)
    })

    datadogRum.addError('string error message')

    connectBridges(pipeline)
    pipeline.seal()
    await waitMicrotask()

    const errorEvent = received.find((e: any) => e.error instanceof Error) as any
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error.message).toBe('string error message')
  })
})
