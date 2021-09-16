import { clocksNow, ErrorSource, ONE_MINUTE, RawError } from '..'

export type EventRateLimiter = ReturnType<typeof createEventRateLimiter>

export function createEventRateLimiter(
  eventType: string,
  limit: number,
  onLimitReached: (limitError: RawError) => void
) {
  let actionCount = 0
  let allowNextAction = false

  return {
    eventType,
    isLimitReached() {
      if (actionCount === 0) {
        setTimeout(() => {
          actionCount = 0
        }, ONE_MINUTE)
      }

      actionCount += 1
      if (actionCount <= limit || allowNextAction) {
        allowNextAction = false
        return false
      }

      if (actionCount === limit + 1) {
        allowNextAction = true
        try {
          onLimitReached({
            message: `Reached max number of ${eventType}s by minute: ${limit}`,
            source: ErrorSource.AGENT,
            startClocks: clocksNow(),
          })
        } finally {
          allowNextAction = false
        }
      }

      return true
    },
  }
}
