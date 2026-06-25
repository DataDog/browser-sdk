import type { SessionManager } from '@datadog/browser-core'
import { DISCARDED } from '@datadog/js-core/assembly'
import type { LogsConfiguration } from '../configuration'
import type { AssembleHook } from '../hooks'

export function startSessionContext(
  hook: AssembleHook,
  configuration: LogsConfiguration,
  sessionManager: SessionManager
) {
  hook.register(({ startTime }) => {
    const session = sessionManager.findTrackedSession(startTime)

    const isSessionTracked = sessionManager.findTrackedSession(startTime, {
      returnInactive: true,
    })

    if (!isSessionTracked) {
      return DISCARDED
    }

    return {
      service: configuration.service,
      session_id: session ? session.id : undefined,
      session: session ? { id: session.id } : undefined,
    }
  })
}
