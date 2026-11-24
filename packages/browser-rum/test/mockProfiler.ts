import { globalObject } from '@datadog/js-core/util'
import type { ProfilerTrace, ProfilerInitOptions } from '@datadog/js-core/util'
import { registerCleanupTask } from '@datadog/browser-core/test'

export function mockProfiler(mockedTrace: ProfilerTrace) {
  // Save original Profiler class to restore it during cleanup.
  const originalProfiler = globalObject.Profiler

  // Store all instances of the MockProfiler class. May be useful for testing.
  const instances = new Set<MockProfiler>()

  class MockProfiler {
    /** Sample interval in ms. */
    readonly sampleInterval: number
    /** Init options the instance was created with. */
    readonly initOptions: ProfilerInitOptions
    /** True if profiler is stopped. */
    stopped: boolean
    private readonly sampleBufferFullListeners = new Set<(ev?: unknown) => void>()

    constructor(options: ProfilerInitOptions) {
      this.sampleInterval = options.sampleInterval
      this.initOptions = options
      this.stopped = false

      instances.add(this)

      return this
    }

    stop(): Promise<ProfilerTrace> {
      this.stopped = true
      return Promise.resolve(mockedTrace)
    }

    addEventListener(type: string, listener: (ev?: unknown) => void): void {
      if (type === 'samplebufferfull') {
        this.sampleBufferFullListeners.add(listener)
      }
    }

    removeEventListener(type: string, listener: (ev?: unknown) => void): void {
      if (type === 'samplebufferfull') {
        this.sampleBufferFullListeners.delete(listener)
      }
    }

    /** Simulates the sample buffer filling up. */
    triggerSampleBufferFull(): void {
      this.sampleBufferFullListeners.forEach((listener) => listener())
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
