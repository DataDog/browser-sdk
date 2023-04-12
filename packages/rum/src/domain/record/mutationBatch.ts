import { noop, monitor } from '@datadog/browser-core'
import type { RumMutationRecord } from './observers'

/**
 * Maximum duration to wait before processing mutations. If the browser is idle, mutations will be
 * processed more quickly. If the browser is busy executing small tasks (ex: rendering frames), the
 * mutations will wait MUTATION_PROCESS_MAX_DELAY milliseconds before being processed. If the
 * browser is busy executing a longer task, mutations will be processed after this task.
 */
const MUTATION_PROCESS_MAX_DELAY = 100

export function createMutationBatch(processMutationBatch: (mutations: RumMutationRecord[]) => void) {
  let cancelScheduledFlush = noop
  let pendingMutations: RumMutationRecord[] = []

  function flush() {
    cancelScheduledFlush()
    processMutationBatch(pendingMutations)
    pendingMutations = []
  }

  return {
    addMutations: (mutations: RumMutationRecord[]) => {
      if (pendingMutations.length === 0) {
        cancelScheduledFlush = requestIdleCallback(flush, { timeout: MUTATION_PROCESS_MAX_DELAY })
      }
      pendingMutations.push(...mutations)
    },

    flush,

    stop: () => {
      cancelScheduledFlush()
    },
  }
}

/**
 * Use 'requestIdleCallback' when available: it will throttle the mutation processing if the
 * browser is busy rendering frames (ex: when frames are below 60fps). When not available, the
 * fallback on 'requestAnimationFrame' will still ensure the mutations are processed after any
 * browser rendering process (Layout, Recalculate Style, etc.), so we can serialize DOM nodes efficiently.
 *
 * Note: check both 'requestIdleCallback' and 'cancelIdleCallback' existence because some polyfills only implement 'requestIdleCallback'.
 */
function requestIdleCallback(callback: () => void, opts?: { timeout?: number }) {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(monitor(callback), opts)
    return () => window.cancelIdleCallback(id)
  }
  const id = window.requestAnimationFrame(monitor(callback))
  return () => window.cancelAnimationFrame(id)
}
