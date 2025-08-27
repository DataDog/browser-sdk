import { getCookie } from '../../browser/cookie'
import { elapsed, ONE_SECOND, timeStampNow } from '../../tools/utils/timeUtils'
import { addTelemetryDebug } from '../telemetry'
import type { SessionState } from './sessionState'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

const FAST_RENEW_INTERVAL = ONE_SECOND
const FAST_RENEW_COUNT_THRESHOLD = 2

export function startSessionRenewTelemetry() {
  let lastRenewTime = timeStampNow()
  let fastRenewCount = 0

  return {
    onRenew(sessionCache: SessionState, sessionState: SessionState) {
      const now = timeStampNow()
      const interval = elapsed(lastRenewTime, now)
      if (interval < FAST_RENEW_INTERVAL) {
        fastRenewCount += 1
        if (fastRenewCount === FAST_RENEW_COUNT_THRESHOLD) {
          addTelemetryDebug('High session renew rate detected', {
            debug: {
              sessionCache,
              sessionState,
              rawCookie: getCookie(SESSION_STORE_KEY),
            },
          })
        }
      }

      lastRenewTime = now
    },
  }
}
