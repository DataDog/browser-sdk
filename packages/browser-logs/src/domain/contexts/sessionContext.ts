import type { SessionManager } from '@datadog/browser-core'
import { DISCARDED } from '@datadog/js-core/assembly'
import type { LogsConfiguration } from '../configuration'
import type { AssembleHook } from '../hooks'

export function startSessionContext(
  hook: AssembleHook,
  configuration: LogsConfiguration,
  sessionManager: Pick<SessionManager, 'findTrackedSession'>
) {
  // In the Logs plugin, the session manager is RUM's and defaults to RUM's rate, so pass Logs' own
  const sampleRate = configuration.sessionSampleRate

  hook.register(({ startTime }) => {
    // Used to attach a (fresh, safe-to-reference) session id: subject to the default
    // TRACKED_SESSION_MAX_AGE, so it becomes undefined once the session is too old to reference.
    const session = sessionManager.findTrackedSession(startTime, { sampleRate })

    // Used for the discard decision: unlike `session` above, this ignores session age (logs
    // should keep being sent indefinitely, with or without a session, once a session was
    // legitimately tracked here) but still respects sampling.
    const isSessionTracked = sessionManager.findTrackedSession(startTime, {
      returnInactive: true,
      maxAge: Infinity,
      sampleRate,
    })

    if (!isSessionTracked) {
      return DISCARDED
    }

    return {
      service: configuration.service,
      version: configuration.version,
      session_id: session ? session.id : undefined,
      session: session ? { id: session.id } : undefined,
    }
  })
}
