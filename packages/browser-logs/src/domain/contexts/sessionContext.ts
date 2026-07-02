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
    // Used to attach a (fresh, safe-to-reference) session id: subject to the default
    // TRACKED_SESSION_MAX_AGE, so it becomes undefined once the session is too old to reference.
    const session = sessionManager.findTrackedSession(startTime)

    // Used for the discard decision: unlike `session` above, this ignores session age (logs
    // should keep being sent indefinitely, with or without a session, once a session was
    // legitimately tracked here) but still respects sampling.
    const isSessionTracked = sessionManager.findTrackedSession(startTime, {
      returnInactive: true,
      maxAge: Infinity,
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
