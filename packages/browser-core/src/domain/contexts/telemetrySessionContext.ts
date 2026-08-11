import type { Hook } from '@datadog/js-core/assembly'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { SessionManager } from '../session/sessionManager'
import type { Context } from '../../tools/serialisation/context'

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
