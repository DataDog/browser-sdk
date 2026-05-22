import type { SessionManager } from '../session/sessionManager'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { HookNames, SKIPPED } from '../../tools/abstractHooks'
import type { Context } from '../../tools/serialisation/context'

export function startTelemetrySessionContext(
  hooks: AbstractHooks,
  sessionManager: SessionManager,
  extraContext?: Context
) {
  hooks.register(HookNames.AssembleTelemetry, ({ startTime }) => {
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
