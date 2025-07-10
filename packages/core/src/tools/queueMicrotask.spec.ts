import { startFakeTelemetry } from '../domain/telemetry'
import { queueMicrotask } from './queueMicrotask'

describe('queueMicrotask', () => {
  it('calls the callback in a microtask', async () => {
    let called = false
    queueMicrotask(() => {
      called = true
    })
    expect(called).toBe(false)
    await Promise.resolve() // wait for the microtask to execute
    expect(called).toBe(true)
  })

  it('monitors the callback', async () => {
    const telemetryEvents = startFakeTelemetry()
    queueMicrotask(() => {
      throw new Error('test error')
    })
    await Promise.resolve() // wait for the microtask to execute

    expect(telemetryEvents).toEqual([])
  })
})
