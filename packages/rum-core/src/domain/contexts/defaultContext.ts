import { canUseEventBridge, currentDrift, HookNames, round, timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { RumConfiguration } from '../configuration'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export type SdkName = 'rum' | 'rum-slim' | 'rum-synthetics'

export function startDefaultContext(hooks: Hooks, configuration: RumConfiguration, sdkName: SdkName | undefined) {
  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes => {
    const source = configuration.source

    return {
      type: eventType,
      _dd: {
        format_version: 2,
        drift: currentDrift(),
        configuration: {
          session_sample_rate: round(configuration.sessionSampleRate, 3),
          session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3),
          profiling_sample_rate: round(configuration.profilingSampleRate, 3),
          trace_sample_rate: round(configuration.traceSampleRate, 3),
          beta_encode_cookie_options: configuration.betaEncodeCookieOptions,
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

  hooks.register(
    HookNames.AssembleTelemetry,
    (): DefaultTelemetryEventAttributes => ({
      application: { id: configuration.applicationId },
    })
  )
}

export function defaultContextDecoratorFactory(deps: {
  configuration: RumConfiguration
  getCurrentDrift: () => number
  getTimeStampNow: () => TimeStamp
  canUseEventBridge: () => boolean
  sdkName: SdkName | undefined
}): DecoratorFactory<
  Observation,
  {
    application: { id: string }
    date: TimeStamp
    source: string | undefined
    _dd: {
      formatVersion: number
      drift: number
      configuration: {
        sessionSampleRate: number
        sessionReplaySampleRate: number
        profilingSampleRate: number
        traceSampleRate: number
        betaEncodeCookieOptions: boolean | undefined
      }
      browserSdkVersion: string | undefined
      sdkName: SdkName | undefined
    }
  }
> {
  return {
    name: 'defaultContext',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) => {
        const { configuration } = deps
        const attributes = {
          application: { id: configuration.applicationId },
          date: deps.getTimeStampNow(),
          source: configuration.source,
          _dd: {
            formatVersion: 2,
            drift: deps.getCurrentDrift(),
            configuration: {
              sessionSampleRate: round(configuration.sessionSampleRate, 3),
              sessionReplaySampleRate: round(configuration.sessionReplaySampleRate, 3),
              profilingSampleRate: round(configuration.profilingSampleRate, 3),
              traceSampleRate: round(configuration.traceSampleRate, 3),
              betaEncodeCookieOptions: configuration.betaEncodeCookieOptions,
            },
            browserSdkVersion: deps.canUseEventBridge() ? __BUILD_ENV__SDK_VERSION__ : undefined,
            sdkName: deps.sdkName,
          },
        }
        return Promise.resolve({ status: 'contributed' as const, attributes })
      },
    }),
  }
}
