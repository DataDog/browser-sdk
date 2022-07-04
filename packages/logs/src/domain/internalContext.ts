import type { RelativeTime } from '@datadog/browser-core'
import type { LogsSessionManager } from './logsSessionManager'

export interface InternalContext {
  session_id: string | undefined
}

export function startInternalContext(sessionManager: LogsSessionManager) {
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
