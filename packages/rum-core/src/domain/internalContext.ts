import { RelativeTime } from '@datadog/browser-core'
import { InternalContext } from '../rawRumEvent.types'
import { ParentContexts } from './parentContexts'
import { RumSession } from './rumSession'
import { UrlContexts } from './urlContexts'

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(
  applicationId: string,
  session: RumSession,
  parentContexts: ParentContexts,
  urlContexts: UrlContexts
) {
  return {
    get: (startTime?: number): InternalContext | undefined => {
      const viewContext = parentContexts.findView(startTime as RelativeTime)
      const urlContext = urlContexts.findUrl(startTime as RelativeTime)
      if (session.isTracked(startTime as RelativeTime) && viewContext && urlContext) {
        const actionContext = parentContexts.findAction(startTime as RelativeTime)
        return {
          application_id: applicationId,
          session_id: session.getId(startTime as RelativeTime),
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
