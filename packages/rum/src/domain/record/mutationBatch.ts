import { noop, requestIdleCallback } from '@datadog/browser-core'
import type { RumMutationRecord } from './mutationObserver'

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
