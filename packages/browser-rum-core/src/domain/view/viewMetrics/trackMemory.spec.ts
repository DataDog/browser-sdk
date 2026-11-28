import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { MemoryMetrics } from './trackMemory'
import { MEMORY_SAMPLING_INTERVAL, trackMemory } from './trackMemory'

describe('trackMemory', () => {
  let clock: Clock
  let callback: jasmine.Spy<(memory: MemoryMetrics) => void>
  let usedJSHeapSize: unknown

  // Chromium returns a new snapshot on each `performance.memory` access
  function mockMemory(getMemory: () => unknown = () => ({ usedJSHeapSize })) {
    const original = Object.getOwnPropertyDescriptor(performance, 'memory')
    Object.defineProperty(performance, 'memory', { configurable: true, get: getMemory })
    registerCleanupTask(() => {
      if (original) {
        Object.defineProperty(performance, 'memory', original)
      } else {
        delete (performance as { memory?: unknown }).memory
      }
    })
  }

  beforeEach(() => {
    clock = mockClock()
    callback = jasmine.createSpy()
  })

  it('reports the average and the peak of the sampled JS heap size', () => {
    usedJSHeapSize = 100
    mockMemory()
    const { stop } = trackMemory(callback)
    registerCleanupTask(stop)

    expect(callback).toHaveBeenCalledWith({ average: 100, max: 100 })
    usedJSHeapSize = 300
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).toHaveBeenCalledWith({ average: 200, max: 300 })
    usedJSHeapSize = 50
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).toHaveBeenCalledWith({ average: 150, max: 300 })
  })

  it('stops sampling when stopped', () => {
    usedJSHeapSize = 100
    mockMemory()
    const { stop } = trackMemory(callback)
    stop()
    clock.tick(MEMORY_SAMPLING_INTERVAL * 3)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the browser does not expose the JS heap size', () => {
    mockMemory(() => undefined)
    const { stop } = trackMemory(callback)
    registerCleanupTask(stop)
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).not.toHaveBeenCalled()
  })

  it('does nothing when `performance.memory` does not expose a numeric JS heap size', () => {
    mockMemory(() => () => undefined)
    const { stop } = trackMemory(callback)
    registerCleanupTask(stop)
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).not.toHaveBeenCalled()
  })

  it('skips samples where the JS heap size is not a number', () => {
    usedJSHeapSize = 100
    mockMemory()
    const { stop } = trackMemory(callback)
    registerCleanupTask(stop)

    usedJSHeapSize = undefined
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ average: 100, max: 100 })
  })
})
