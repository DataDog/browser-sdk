import type { RelativeTime } from '@datadog/browser-core'
import { LogsComponents } from '../boot/logsComponents'
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
/* eslint-disable local-rules/disallow-side-effects */
startInternalContext.$id = LogsComponents.InternalContext
startInternalContext.$deps = [LogsComponents.Session]
/* eslint-enable local-rules/disallow-side-effects */
