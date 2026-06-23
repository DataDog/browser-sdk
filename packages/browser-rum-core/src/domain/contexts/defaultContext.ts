import { clockDrift, timeStampNow } from '@openobserve/js-core/time'
import { canUseEventBridge, round } from '@openobserve/browser-core'
import type { RumConfiguration } from '../configuration'
import type { AssembleHook, DefaultRumEventAttributes } from '../hooks'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export type SdkName = 'rum' | 'rum-slim' | 'rum-synthetics'

export function startDefaultContext(
  assembleHook: AssembleHook,
  configuration: RumConfiguration,
  sdkName: SdkName | undefined
) {
  assembleHook.register(({ eventType }): DefaultRumEventAttributes => {
    const source = configuration.source

    return {
      type: eventType,
      _oo: {
        format_version: 2,
        drift: clockDrift(),
        configuration: {
          session_sample_rate: round(configuration.sessionSampleRate, 3),
          session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3),
          profiling_sample_rate: round(configuration.profilingSampleRate, 3),
          trace_sample_rate: round(configuration.traceSampleRate, 3),
        },
        browser_sdk_version: canUseEventBridge() ? __BUILD_ENV__SDK_VERSION__ : undefined,
        sdk_name: sdkName,
      },
      application: {
        id: configuration.applicationId,
      },
      date: timeStampNow(),
      source,
    }
  })
}
