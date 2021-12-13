import { RelativeTime } from '@datadog/browser-core'
import { InternalContext } from '../rawRumEvent.types'
import { ParentContexts } from './parentContexts'
import { RumSessionManager } from './rumSessionManager'
import { UrlContexts } from './urlContexts'

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
          view: {
            ...viewContext.view,
            ...urlContext.view,
          },
        }
      }
    },
  }
}
