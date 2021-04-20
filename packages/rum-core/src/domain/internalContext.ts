import { RelativeTime, preferredTime, getTimeStamp } from '@datadog/browser-core'
import { InternalContext } from '../rawRumEvent.types'
import { ParentContexts } from './parentContexts'
import { RumSession } from './rumSession'

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(applicationId: string, session: RumSession, parentContexts: ParentContexts) {
  return {
    get: (startTime?: number): InternalContext | undefined => {
      // no correction since relative time is computed from system clock
      const time =
        startTime !== undefined
          ? preferredTime(getTimeStamp(startTime as RelativeTime), startTime as RelativeTime)
          : undefined
      const viewContext = parentContexts.findView(time)
      if (session.isTracked() && viewContext && viewContext.session.id) {
        const actionContext = parentContexts.findAction(time)
        return {
          application_id: applicationId,
          session_id: viewContext.session.id,
          user_action: actionContext
            ? {
                id: actionContext.action.id,
              }
            : undefined,
          view: viewContext.view,
        }
      }
    },
  }
}
