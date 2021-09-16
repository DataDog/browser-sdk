import { clocksNow, ErrorSource, ONE_MINUTE, RawError } from '..'

export type EventRateLimiter = ReturnType<typeof createEventRateLimiter>

export function createEventRateLimiter(
  eventType: string,
  limit: number,
  onLimitReached: (limitError: RawError) => void
) {
  let eventCount = 0
  let allowNextEvent = false

  return {
    isLimitReached() {
      if (eventCount === 0) {
        setTimeout(() => {
          eventCount = 0
        }, ONE_MINUTE)
      }

      eventCount += 1
      if (eventCount <= limit || allowNextEvent) {
        allowNextEvent = false
        return false
      }

      if (eventCount === limit + 1) {
        allowNextEvent = true
        try {
          onLimitReached({
            message: `Reached max number of ${eventType}s by minute: ${limit}`,
            source: ErrorSource.AGENT,
            startClocks: clocksNow(),
          })
        } finally {
          allowNextEvent = false
        }
      }

      return true
    },
  }
}
