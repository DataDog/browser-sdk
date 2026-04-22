import { Pipeline } from '@datadog/core-next'
import type { RuntimeErrorResource } from '@datadog/core-next'
import { startRuntimeErrorCollection } from './runtimeErrorCollector'

describe('startRuntimeErrorCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let stop: () => void
  let collected: RuntimeErrorResource[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    collected = []
    pipeline.subscribe('resource:runtime_error', (event) => {
      collected.push(event as RuntimeErrorResource)
    })
    pipeline.seal()

    stop = startRuntimeErrorCollection(pipeline)

    // Prevent Jasmine from catching uncaught errors and failing the test
    spyOn(window as any, 'onerror')
  })

  afterEach(() => {
    stop()
  })

  it('publishes resource:runtime_error on uncaught error', () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('test'), message: 'test' }))
    expect(collected.length).toBe(1)
  })

  it('includes message and raw error object', () => {
    const err = new Error('boom')
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: 'boom' }))
    expect(collected[0].message).toBe('boom')
    expect(collected[0].error).toBe(err)
  })

  it('includes error type/name', () => {
    const err = new TypeError('bad type')
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: 'bad type' }))
    expect(collected[0].type).toBe('TypeError')
  })

  it('publishes resource:runtime_error on unhandled rejection', () => {
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        reason: new Error('rejected'),
        promise: Promise.resolve(),
      })
    )
    expect(collected.length).toBe(1)
  })

  it('handles rejection with non-Error reason (string)', () => {
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        reason: 'something went wrong',
        promise: Promise.resolve(),
      })
    )
    expect(collected[0].message).toBe('something went wrong')
    expect(collected[0].type).toBe('Unhandled Rejection')
  })

  it('does not publish after stop() is called', () => {
    stop()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after stop'), message: 'after stop' }))
    expect(collected.length).toBe(0)
  })
})
