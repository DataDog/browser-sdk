import { registerCleanupTask } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/browser-core'
import type { ProfilerTrace, ProfilerInitOptions } from '@datadog/browser-core'

export function mockProfiler(mockedTrace: ProfilerTrace) {
  // Save original Profiler class to restore it during cleanup.
  const originalProfiler = globalObject.Profiler

  // Store all instances of the MockProfiler class. May be useful for testing.
  const instances = new Set<MockProfiler>()

  class MockProfiler {
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
  globalObject.Profiler = MockProfiler

  registerCleanupTask(() => {
    // Restore the Profiler class.
    globalObject.Profiler = originalProfiler
    instances.clear()
  })

  return {
    instances,
  }
}
