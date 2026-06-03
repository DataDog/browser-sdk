import { setTimeout } from '../../tools/timer'
import { clocksNow, ONE_MINUTE } from '../../tools/utils/timeUtils'
import type { RawError } from '../error/error.types'
import { ErrorSource } from '../error/error.types'

export type EventRateLimiter = ReturnType<typeof createEventRateLimiter>

// Limit the maximum number of actions, errors and logs per minutes
const EVENT_RATE_LIMIT = 3000

export function createEventRateLimiter(
  eventType: string,
  onLimitReached: (limitError: RawError) => void,
  limit = EVENT_RATE_LIMIT
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
