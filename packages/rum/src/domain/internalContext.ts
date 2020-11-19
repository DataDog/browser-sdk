import { combine, Configuration, withSnakeCaseKeys } from '@datadog/browser-core'
import { InternalContext } from '../types'
import { ParentContexts } from './parentContexts'
import { RumSession } from './rumSession'

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(
  applicationId: string,
  session: RumSession,
  parentContexts: ParentContexts,
  configuration: Configuration
) {
  return {
    get: (startTime?: number) => {
      if (configuration.isEnabled('v2_format')) {
        const viewContext = parentContexts.findViewV2(startTime)
        if (session.isTracked() && viewContext && viewContext.session.id) {
          const actionContext = parentContexts.findActionV2(startTime)
          return (withSnakeCaseKeys(
            combine(
              { applicationId },
              { sessionId: viewContext.session.id, view: viewContext.view },
              actionContext ? { userAction: { id: actionContext.action.id } } : undefined
            )
          ) as unknown) as InternalContext
        }
      } else {
        const viewContext = parentContexts.findView(startTime)
        if (session.isTracked() && viewContext && viewContext.sessionId) {
          return (withSnakeCaseKeys(
            combine({ applicationId }, viewContext, parentContexts.findAction(startTime))
          ) as unknown) as InternalContext
        }
      }
    },
  }
}
