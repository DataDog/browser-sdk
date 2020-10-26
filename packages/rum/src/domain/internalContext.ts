import { combine, Configuration, withSnakeCaseKeys } from '@datadog/browser-core'
import { InternalContext } from '../types'
import { InternalContextV2 } from '../typesV2'
import { ParentContexts } from './parentContexts'
import { RumSession } from './rumSession'

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
          return (withSnakeCaseKeys(
            combine(
              {
                application: {
                  id: applicationId,
                },
              },
              viewContext,
              parentContexts.findActionV2(startTime)
            )
          ) as unknown) as InternalContextV2
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
