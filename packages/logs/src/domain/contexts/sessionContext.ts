import type { TrackingConsentState } from '@datadog/browser-core'
import { DISCARDED, HookNames } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LogsSessionManager } from '../logsSessionManager'
import type { Hooks } from '../hooks'

export function startSessionContext(
  hooks: Hooks,
  configuration: LogsConfiguration,
  sessionManager: LogsSessionManager,
  trackingConsentState: TrackingConsentState
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
}
