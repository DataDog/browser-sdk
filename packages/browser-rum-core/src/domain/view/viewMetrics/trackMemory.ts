import { clearInterval, noop, setInterval } from '@datadog/js-core/util'

export const MEMORY_SAMPLING_INTERVAL = 10_000

export interface MemoryMetrics {
  average: number
  max: number
}

interface PerformanceWithMemory {
  memory?: { usedJSHeapSize?: unknown }
}

// `performance.memory` is Chromium-only and quantized, so consecutive samples may repeat the same value.
// Each access returns a new snapshot, hence the read on every sample. The type check guards against
// polyfilled or faked `performance` objects exposing `memory` as something else.
function getUsedJSHeapSize() {
  const used = (performance as PerformanceWithMemory).memory?.usedJSHeapSize
  return typeof used === 'number' ? used : undefined
}

export function trackMemory(callback: (memory: MemoryMetrics) => void) {
  if (getUsedJSHeapSize() === undefined) {
    return { stop: noop }
  }
  let count = 0
  let sum = 0
  let max = 0
  function sample() {
    const used = getUsedJSHeapSize()
    if (used === undefined) {
      return
    }
    count += 1
    sum += used
    max = Math.max(max, used)
    callback({ average: Math.round(sum / count), max })
  }
  sample()
  const intervalId = setInterval(sample, MEMORY_SAMPLING_INTERVAL)
  return { stop: () => clearInterval(intervalId) }
}
