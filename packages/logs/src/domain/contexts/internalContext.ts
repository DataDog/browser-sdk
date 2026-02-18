import type { RelativeTime, SessionManager } from '@datadog/browser-core'

export interface InternalContext {
  session_id: string | undefined
}

export function startInternalContext(sessionManager: SessionManager, sampleRate: number) {
  return {
    get: (startTime?: number): InternalContext | undefined => {
      const trackedSession = sessionManager.findTrackedSession(sampleRate, startTime as RelativeTime)
      if (trackedSession) {
        return {
          session_id: trackedSession.id,
        }
      }
    },
  }
}
