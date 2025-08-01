import { DISCARDED, HookNames, SKIPPED } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LogsSessionManager } from '../logsSessionManager'
import type { Hooks } from '../hooks'

export function startSessionContext(
  hooks: Hooks,
  configuration: LogsConfiguration,
  sessionManager: LogsSessionManager
) {
  hooks.register(HookNames.Assemble, ({ startTime }) => {
    const session = sessionManager.findTrackedSession(startTime)

    const isSessionTracked = sessionManager.findTrackedSession(startTime, { returnInactive: true })

    if (!isSessionTracked) {
      return DISCARDED
    }

    return {
      service: configuration.service,
      session_id: session ? session.id : undefined,
      session: session ? { id: session.id } : undefined,
    }
  })

  hooks.register(HookNames.AssembleTelemetry, ({ startTime }) => {
    const session = sessionManager.findTrackedSession(startTime)

    if (!session || !session.id) {
      return SKIPPED
    }

    return {
      session: { id: session.id },
    }
  })
}
