import type { RelativeTime, RumInternalContext } from '@datadog/browser-core'
import type { ActionContexts } from '../action/actionCollection'
import type { RumSessionManager } from '../rumSessionManager'
import type { ViewHistory } from './viewHistory'
import type { UrlContexts } from './urlContexts'

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(
  applicationId: string,
  sessionManager: RumSessionManager,
  viewHistory: ViewHistory,
  actionContexts: ActionContexts,
  urlContexts: UrlContexts
) {
  return {
    get: (startTime?: number): RumInternalContext | undefined => {
      const viewContext = viewHistory.findView(startTime as RelativeTime)
      const urlContext = urlContexts.findUrl(startTime as RelativeTime)
      const session = sessionManager.findTrackedSession(startTime as RelativeTime)
      if (session && viewContext && urlContext) {
        const actionId = actionContexts.findActionId(startTime as RelativeTime)
        return {
          application_id: applicationId,
          session_id: session.id,
          user_action: actionId ? { id: actionId } : undefined,
          view: { id: viewContext.id, name: viewContext.name, referrer: urlContext.referrer, url: urlContext.url },
        }
      }
    },
  }
}
