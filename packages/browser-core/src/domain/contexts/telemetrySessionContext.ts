import type { Hook } from '@datadog/js-core/assembly'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { Context } from '@datadog/js-core/util'
import type { SessionManager } from '../session/sessionManager'

export function startTelemetrySessionContext(
  assembleTelemetryHook: Hook<any, any>,
  sessionManager: SessionManager,
  extraContext?: Context
) {
  assembleTelemetryHook.register(({ startTime }) => {
    const session = sessionManager.findTrackedSession(startTime)

    if (!session) {
      return SKIPPED
    }

    return {
      session: {
        id: session.id,
      },
      anonymous_id: session.anonymousId,
      ...extraContext,
    }
  })
}
