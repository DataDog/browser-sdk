import { setInterval, clearInterval } from '@datadog/js-core/util'

export const MEMORY_SAMPLING_INTERVAL = 10_000

export interface MemoryMetrics {
  average: number
  max: number
}

interface PerformanceWithMemory {
  memory?: { usedJSHeapSize: number }
}

// shortcut: `performance.memory` is Chromium-only and coarse; switch to `measureUserAgentSpecificMemory()` for
// cross-origin isolated pages if precision matters.
export function trackMemory(callback: (memory: MemoryMetrics) => void) {
  const memory = (performance as PerformanceWithMemory).memory
  if (!memory) {
    return { stop: () => undefined }
  }
  let count = 0
  let sum = 0
  let max = 0
  const sample = () => {
    const used = memory.usedJSHeapSize
    count += 1
    sum += used
    max = Math.max(max, used)
    callback({ average: Math.round(sum / count), max })
  }
  sample()
  const intervalId = setInterval(sample, MEMORY_SAMPLING_INTERVAL)
  return { stop: () => clearInterval(intervalId) }
}
