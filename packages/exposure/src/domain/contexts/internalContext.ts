import type { RelativeTime } from '@datadog/browser-core'
import type { ExposureSessionManager } from '../exposureSessionManager'

export interface InternalContext {
  get: (startTime?: RelativeTime) => any
}

export function startInternalContext(sessionManager: ExposureSessionManager): InternalContext {
  return {
    get: (startTime?: RelativeTime) => {
      const session = sessionManager.findTrackedSession(startTime)
      return session ? { session_id: session.id } : undefined
    },
  }
} 