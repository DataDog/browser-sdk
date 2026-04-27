import type { RelativeTime, SessionManager } from '@datadog/browser-core'

export interface InternalContext {
  session_id: string | undefined
}

export function startInternalContext(sessionManager: SessionManager) {
  return {
    get: (startTime?: number): InternalContext | undefined => {
      const trackedSession = sessionManager.findTrackedSession(startTime as RelativeTime)
      if (trackedSession) {
        return {
          session_id: trackedSession.id,
        }
      }
    },
  }
}
