import { addTelemetryDebug, PageExitReason } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export const MAX_TRACKED_OPEN_OPERATIONS = 100

interface OpenOperation {
  name: string
  operationKey: string | undefined
}

/**
 * Keeps track of the operations started with `abandonOnPageExit`, and reports the ones still open
 * as abandoned when the page is terminated.
 *
 * Only PAGE_TERMINATED (pagehide without entering the back/forward cache) abandons them: the page
 * can come back after the other exit reasons. Open operations are forgotten when the session
 * expires or is renewed, as the backend already closes them at the end of the session.
 *
 * Each start is tracked separately, because two starts with the same name and operationKey open
 * two operations, each one needing its own end.
 */
export function trackOpenOperations(
  lifeCycle: LifeCycle,
  abandonOperation: (name: string, operationKey: string | undefined) => void
) {
  let openOperations: OpenOperation[] = []
  let limitReported = false

  function forgetAll() {
    openOperations = []
  }

  const subscriptions = [
    lifeCycle.subscribe(LifeCycleEventType.PREPARE_URGENT_FLUSH, (reason) => {
      if (reason !== PageExitReason.PAGE_TERMINATED) {
        return
      }
      const abandonedOperations = openOperations
      forgetAll()
      abandonedOperations.forEach(({ name, operationKey }) => abandonOperation(name, operationKey))
    }),
    lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, forgetAll),
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, forgetAll),
  ]

  function start(name: string, operationKey: string | undefined) {
    if (openOperations.length >= MAX_TRACKED_OPEN_OPERATIONS) {
      // Drop the oldest one: it is the most likely to never be ended, and the backend will close it
      // at the end of the session anyway.
      openOperations.shift()
      if (!limitReported) {
        limitReported = true
        // monitor-until: 2027-02-03
        addTelemetryDebug('Open operations limit reached', { limit: MAX_TRACKED_OPEN_OPERATIONS })
      }
    }
    openOperations.push({ name, operationKey })
  }

  function end(name: string, operationKey: string | undefined) {
    const index = openOperations.findIndex(
      (operation) => operation.name === name && operation.operationKey === operationKey
    )
    if (index !== -1) {
      openOperations.splice(index, 1)
    }
  }

  function stop() {
    subscriptions.forEach((subscription) => subscription.unsubscribe())
    forgetAll()
  }

  return { start, end, stop }
}
