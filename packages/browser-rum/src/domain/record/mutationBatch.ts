import { noop, throttle, requestIdleCallback } from '@datadog/browser-core'
import type { RumMutationRecord } from '@datadog/browser-rum-core'

/**
 * Maximum duration to wait before processing mutations. If the browser is idle, mutations will be
 * processed more quickly. If the browser is busy executing small tasks (ex: rendering frames), the
 * mutations will wait MUTATION_PROCESS_MAX_DELAY milliseconds before being processed. If the
 * browser is busy executing a longer task, mutations will be processed after this task.
 */
const MUTATION_PROCESS_MAX_DELAY = 100
/**
 * Minimum duration to wait before processing mutations. This is used to batch mutations together
 * and be able to deduplicate them to save processing time and bandwidth.
 * 16ms is the duration of a frame at 60fps that ensure fluid UI.
 */
export const MUTATION_PROCESS_MIN_DELAY = 16

export function createMutationBatch(processMutationBatch: (mutations: RumMutationRecord[]) => void) {
  let cancelScheduledFlush = noop
  let pendingMutations: RumMutationRecord[] = []
  let flushScheduled = false

  function scheduleFlush() {
    if (!flushScheduled) {
      flushScheduled = true
      cancelScheduledFlush = requestIdleCallback(throttledFlush, { timeout: MUTATION_PROCESS_MAX_DELAY })
    }
  }

  function flush() {
    cancelScheduledFlush()
    flushScheduled = false
    processMutationBatch(pendingMutations)
    pendingMutations = []
  }

  const { throttled: throttledFlush, cancel: cancelThrottle } = throttle(flush, MUTATION_PROCESS_MIN_DELAY, {
    leading: false,
  })

  return {
    addMutations: (mutations: RumMutationRecord[]) => {
      scheduleFlush()
      for (const mutation of mutations) {
        pendingMutations.push(mutation)
      }
    },

    notifyContentMutated: scheduleFlush,

    flush,

    stop: () => {
      cancelScheduledFlush()
      cancelThrottle()
    },
  }
}
