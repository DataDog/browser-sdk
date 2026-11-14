import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { MemoryMetrics } from './trackMemory'
import { MEMORY_SAMPLING_INTERVAL, trackMemory } from './trackMemory'

describe('trackMemory', () => {
  let clock: Clock
  let callback: jasmine.Spy<(memory: MemoryMetrics) => void>

  function mockMemory(memory: { usedJSHeapSize: number } | undefined) {
    const original = Object.getOwnPropertyDescriptor(performance, 'memory')
    Object.defineProperty(performance, 'memory', { configurable: true, get: () => memory })
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
    const memory = { usedJSHeapSize: 100 }
    mockMemory(memory)
    const { stop } = trackMemory(callback)
    registerCleanupTask(stop)

    expect(callback).toHaveBeenCalledWith({ average: 100, max: 100 })
    memory.usedJSHeapSize = 300
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).toHaveBeenCalledWith({ average: 200, max: 300 })
    memory.usedJSHeapSize = 50
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).toHaveBeenCalledWith({ average: 150, max: 300 })
  })

  it('stops sampling when stopped', () => {
    mockMemory({ usedJSHeapSize: 100 })
    const { stop } = trackMemory(callback)
    stop()
    clock.tick(MEMORY_SAMPLING_INTERVAL * 3)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the browser does not expose the JS heap size', () => {
    mockMemory(undefined)
    const { stop } = trackMemory(callback)
    registerCleanupTask(stop)
    clock.tick(MEMORY_SAMPLING_INTERVAL)
    expect(callback).not.toHaveBeenCalled()
  })
})
