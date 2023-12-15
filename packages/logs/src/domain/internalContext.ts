import type { Component, RelativeTime } from '@datadog/browser-core'
import { startLogsSessionManager } from './logsSessionManager'
import type { LogsSessionManager } from './logsSessionManager'

export interface InternalContext {
  session_id: string | undefined
}

export const startInternalContext: Component<
  { get: (startTime?: number) => InternalContext | undefined },
  [LogsSessionManager]
> = (sessionManager) => ({
  get: (startTime) => {
    const trackedSession = sessionManager.findTrackedSession(startTime as RelativeTime)
    if (trackedSession) {
      return {
        session_id: trackedSession.id,
      }
    }
  },
})
/* eslint-disable local-rules/disallow-side-effects */
startInternalContext.$deps = [startLogsSessionManager]
/* eslint-enable local-rules/disallow-side-effects */
