import { startMockTelemetry, waitNextMicrotask } from '../../test'
import { queueMicrotask } from './queueMicrotask'

describe('queueMicrotask', () => {
  it('calls the callback in a microtask', async () => {
    let called = false
    queueMicrotask(() => {
      called = true
    })
    expect(called).toBe(false)
    await waitNextMicrotask()
    expect(called).toBe(true)
  })

  it('monitors the callback', async () => {
    const telemetry = startMockTelemetry()
    queueMicrotask(() => {
      throw new Error('test error')
    })
    await waitNextMicrotask()

    expect(await telemetry.hasEvents()).toBe(true)
  })
})
