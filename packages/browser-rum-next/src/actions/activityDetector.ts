import type { Pipeline, Subscription } from '@datadog/core-next'

interface ActivityResult {
  hadActivity: boolean
  endTime?: number
}

interface ActivityDetector {
  onComplete(callback: (result: ActivityResult) => void): void
  stop(): void
}

const VALIDATION_DELAY = 100
const END_DELAY = 100
const MAX_DURATION = 10_000

function createActivityDetector(pipeline: Pipeline<Record<string, unknown>>): ActivityDetector {
  let pendingRequests = 0
  let activityDetected = false
  let completeCallback: ((result: ActivityResult) => void) | undefined
  let validationTimer: ReturnType<typeof setTimeout> | undefined
  let endTimer: ReturnType<typeof setTimeout> | undefined
  let maxTimer: ReturnType<typeof setTimeout> | undefined
  const subscriptions: Subscription[] = []

  function tryComplete(result: ActivityResult): void {
    if (completeCallback) {
      cleanup()
      completeCallback(result)
    }
  }

  function scheduleEnd(): void {
    clearTimeout(endTimer)
    endTimer = setTimeout(() => {
      if (pendingRequests <= 0) {
        tryComplete({ hadActivity: true, endTime: performance.now() })
      }
    }, END_DELAY)
  }

  function onActivity(): void {
    activityDetected = true
    clearTimeout(validationTimer)
    if (pendingRequests <= 0) {
      scheduleEnd()
    }
  }

  subscriptions.push(
    pipeline.subscribe('signal:network_request_start', () => {
      pendingRequests++
      activityDetected = true
      clearTimeout(validationTimer)
      clearTimeout(endTimer)
    })
  )

  subscriptions.push(
    pipeline.subscribe('resource:network_request', () => {
      pendingRequests--
      if (pendingRequests <= 0 && activityDetected) {
        scheduleEnd()
      }
    })
  )

  subscriptions.push(
    pipeline.subscribe('resource:dom_mutation', () => {
      onActivity()
    })
  )

  // Performance resource entries as activity signal (matches v6 behavior)
  subscriptions.push(
    pipeline.subscribe('resource:performance_entry', () => {
      onActivity()
    })
  )

  validationTimer = setTimeout(() => {
    if (!activityDetected) {
      tryComplete({ hadActivity: false })
    }
  }, VALIDATION_DELAY)

  maxTimer = setTimeout(() => {
    if (activityDetected) {
      tryComplete({ hadActivity: true, endTime: performance.now() })
    } else {
      tryComplete({ hadActivity: false })
    }
  }, MAX_DURATION)

  function cleanup(): void {
    clearTimeout(validationTimer)
    clearTimeout(endTimer)
    clearTimeout(maxTimer)
    for (const sub of subscriptions) sub.unsubscribe()
    subscriptions.length = 0
  }

  return {
    onComplete(callback) {
      completeCallback = callback
    },
    stop() {
      cleanup()
    },
  }
}

export { createActivityDetector, VALIDATION_DELAY, END_DELAY, MAX_DURATION }
export type { ActivityResult, ActivityDetector }
