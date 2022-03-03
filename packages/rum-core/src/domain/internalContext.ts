import type { RelativeTime } from '@datadog/browser-core'
import { assign } from '@datadog/browser-core'
import type { InternalContext } from '../rawRumEvent.types'
import type { ParentContexts } from './parentContexts'
import type { RumSessionManager } from './rumSessionManager'
import type { UrlContexts } from './urlContexts'

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(
  applicationId: string,
  sessionManager: RumSessionManager,
  parentContexts: ParentContexts,
  urlContexts: UrlContexts
) {
  return {
    get: (startTime?: number): InternalContext | undefined => {
      const viewContext = parentContexts.findView(startTime as RelativeTime)
      const urlContext = urlContexts.findUrl(startTime as RelativeTime)
      const session = sessionManager.findTrackedSession(startTime as RelativeTime)
      if (session && viewContext && urlContext) {
        const actionContext = parentContexts.findAction(startTime as RelativeTime)
        return {
          application_id: applicationId,
          session_id: session.id,
          user_action: actionContext
            ? {
                id: actionContext.action.id,
              }
            : undefined,
          view: assign({}, viewContext.view, urlContext.view),
        }
      }
    },
  }
}
