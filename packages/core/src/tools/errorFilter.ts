import { Configuration } from '../domain/configuration'
import { ErrorSource, RawError } from './error'
import { clocksNow } from './timeUtils'
import { ONE_MINUTE } from './utils'

export type ErrorFilter = ReturnType<typeof createErrorFilter>

export function createErrorFilter(configuration: Configuration, onLimitReached: (limitError: RawError) => void) {
  let errorCount = 0
  let isSendingLimitError = false

  return {
    shouldSendError() {
      if (errorCount === 0) {
        setTimeout(() => {
          errorCount = 0
        }, ONE_MINUTE)
      }

      errorCount += 1
      if (errorCount < configuration.maxErrorsByMinute || isSendingLimitError) {
        return true
      }

      if (errorCount === configuration.maxErrorsByMinute) {
        isSendingLimitError = true
        try {
          onLimitReached({
            message: `Reached max number of errors by minute: ${configuration.maxErrorsByMinute}`,
            source: ErrorSource.AGENT,
            startClocks: clocksNow(),
          })
        } finally {
          isSendingLimitError = false
        }
      }

      return false
    },
  }
}
