import { combine, withSnakeCaseKeys } from '@datadog/browser-core'
import { InternalContext } from '../types'
import { ParentContexts } from './parentContexts'
import { RumSession } from './rumSession'

export function startInternalContext(applicationId: string, session: RumSession, parentContexts: ParentContexts) {
  return {
    get: (startTime?: number) => {
      const viewContext = parentContexts.findView(startTime)
      if (session.isTracked() && viewContext && viewContext.sessionId) {
        return (withSnakeCaseKeys(
          combine({ applicationId }, viewContext, parentContexts.findAction(startTime))
        ) as unknown) as InternalContext
      }
    },
  }
}
