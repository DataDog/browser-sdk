import type { SessionManager } from '@datadog/browser-core'
import { DISCARDED, HookNames, SKIPPED } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { Hooks } from '../hooks'

export function startSessionContext(hooks: Hooks, configuration: LogsConfiguration, sessionManager: SessionManager) {
  hooks.register(HookNames.Assemble, ({ startTime }) => {
    const session = sessionManager.findTrackedSession(configuration.sessionSampleRate, startTime)

    const isSessionTracked = sessionManager.findTrackedSession(configuration.sessionSampleRate, startTime, {
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

  hooks.register(HookNames.AssembleTelemetry, ({ startTime }) => {
    const session = sessionManager.findTrackedSession(configuration.sessionSampleRate, startTime)

    if (!session) {
      return SKIPPED
    }

    return {
      session: { id: session.id },
    }
  })
}
