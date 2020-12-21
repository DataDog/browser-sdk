import { combine, withSnakeCaseKeys } from '@datadog/browser-core'
import { InternalContext } from '../rawRumEvent.types'
import { ParentContexts } from './parentContexts'
import { RumSession } from './rumSession'

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(applicationId: string, session: RumSession, parentContexts: ParentContexts) {
  return {
    get: (startTime?: number) => {
      const viewContext = parentContexts.findView(startTime)
      if (session.isTracked() && viewContext && viewContext.session.id) {
        const actionContext = parentContexts.findAction(startTime)
        return (withSnakeCaseKeys(
          combine(
            { applicationId },
            { sessionId: viewContext.session.id, view: viewContext.view },
            actionContext ? { userAction: { id: actionContext.action.id } } : undefined
          )
        ) as unknown) as InternalContext
      }
    },
  }
}
