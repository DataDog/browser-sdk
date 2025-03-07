import { registerCleanupTask } from '@datadog/browser-core/test'
import { getGlobalObject } from '@datadog/browser-core'
import type { Profiler, ProfilerInitOptions, ProfilerTrace } from '../../src/domain/profiling/types'

export function mockProfiler(mockedTrace: ProfilerTrace) {
  const globalThis = getGlobalObject()
  // Save original Profiler class to restore it during cleanup.
  const originalProfiler = (globalThis as any).Profiler

  // Store all instances of the MockProfiler class. May be useful for testing.
  const instances = new Set<MockProfiler>()

  class MockProfiler implements Omit<Profiler, 'new'> {
    /** Sample interval in ms. */
    readonly sampleInterval: number
    /** True if profiler is stopped. */
    readonly stopped: boolean

    constructor(options: ProfilerInitOptions) {
      this.sampleInterval = options.sampleInterval
      this.stopped = false

      return this
    }

    stop(): Promise<ProfilerTrace> {
      return Promise.resolve(mockedTrace)
    }

    addEventListener(): void {
      return
    }

    removeEventListener(): void {
      return
    }

    dispatchEvent(): boolean {
      return true
    }
  }

  // Mock the Profiler class
  ;(globalThis as any).Profiler = MockProfiler

  registerCleanupTask(() => {
    // Restore the Profiler class.
    ;(globalThis as any).Profiler = originalProfiler
    instances.clear()
  })

  return {
    instances,
  }
}
