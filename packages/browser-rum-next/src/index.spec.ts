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

  it('addAction after connect sends action:add_action to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_action', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    datadogRum.addAction('my-action', { source: 'test' })
    await waitMicrotask()

    const action = received.find((e: any) => e.name === 'my-action') as any
    expect(action).toBeDefined()
    expect(action.context).toEqual({ source: 'test' })
  })

  it('addError with Error object publishes action:add_error', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_error', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    const err = new Error('rum error test')
    datadogRum.addError(err, { extra: 'data' })
    await waitMicrotask()

    const errorEvent = received.find((e: any) => e.error?.message === 'rum error test') as any
    expect(errorEvent).toBeDefined()
    expect(errorEvent.context).toEqual({ extra: 'data' })
  })

  it('addError with string converts to Error and publishes action:add_error', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:add_error', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    datadogRum.addError('string error')
    await waitMicrotask()

    const errorEvent = received.find((e: any) => e.error instanceof Error && e.error.message === 'string error') as any
    expect(errorEvent).toBeDefined()
  })

  it('startView publishes action:start_view with route_change loading type', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:start_view', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    datadogRum.startView('checkout')
    await waitMicrotask()

    const view = received.find((e: any) => e.name === 'checkout') as any
    expect(view).toBeDefined()
    expect(view.loadingType).toBe('route_change')
  })

  it('datadogRum exposes startAction and stopAction', () => {
    expect(typeof (datadogRum as any).startAction).toBe('function')
    expect(typeof (datadogRum as any).stopAction).toBe('function')
  })

  it('startAction publishes action:start_action to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:start_action', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    ;(datadogRum as any).startAction('checkout', { actionKey: 'checkout-btn' })
    await waitMicrotask()

    const action = received.find((e: any) => e.name === 'checkout') as any
    expect(action).toBeDefined()
    expect(action.actionKey).toBe('checkout-btn')
  })

  it('stopAction publishes action:stop_action to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const received: unknown[] = []

    pipeline.subscribe('action:stop_action', (event) => {
      received.push(event)
    })

    connectBridges(pipeline)
    pipeline.seal()

    ;(datadogRum as any).stopAction('checkout', { actionKey: 'checkout-btn', context: { revenue: 100 } })
    await waitMicrotask()

    const action = received.find((e: any) => e.name === 'checkout') as any
    expect(action).toBeDefined()
    expect(action.actionKey).toBe('checkout-btn')
  })
})
