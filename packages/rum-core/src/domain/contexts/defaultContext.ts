import { canUseEventBridge, currentDrift, round, timeStampNow } from '@datadog/browser-core'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'
import type { RumConfiguration } from '../configuration'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export function startDefaultContext(hooks: Hooks, configuration: RumConfiguration) {
  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | undefined => ({
    type: eventType,
    _dd: {
      format_version: 2,
      drift: currentDrift(),
      configuration: {
        session_sample_rate: round(configuration.sessionSampleRate, 3),
        session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3),
      },
      browser_sdk_version: canUseEventBridge() ? __BUILD_ENV__SDK_VERSION__ : undefined,
    },
    application: {
      id: configuration.applicationId,
    },
    date: timeStampNow(),
    source: 'browser',
  }))
}
