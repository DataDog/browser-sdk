import { canUseEventBridge, currentDrift, HookNames, round, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export function startDefaultContext(
  hooks: Hooks,
  configuration: RumConfiguration,
  sdkName: 'rum' | 'rum-slim' | 'rum-synthetics' | undefined
) {
  hooks.register(
    HookNames.Assemble,
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      _dd: {
        format_version: 2,
        drift: currentDrift(),
        configuration: {
          session_sample_rate: round(configuration.sessionSampleRate, 3),
          session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3),
        },
        browser_sdk_version: canUseEventBridge() ? __BUILD_ENV__SDK_VERSION__ : undefined,
        sdk_name: sdkName,
      },
      application: {
        id: configuration.applicationId,
      },
      date: timeStampNow(),
      source: 'browser',
    })
  )
}
