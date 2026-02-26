import type { AssembledRumEvent } from '../../rawRumEvent.types'
import type { SessionReplayState } from '../rumSessionManager'

/**
 * Converts an enriched Observation (camelCase decorator contributions + snake_case rawRumEvent data)
 * to the AssembledRumEvent wire format (fully snake_case).
 *
 * This is the single serialization boundary in the Pipeline architecture.
 */
export function toServerFormat(enriched: Record<string, unknown>): AssembledRumEvent {
  const data = (enriched.data as Record<string, unknown>) ?? {}

  // Merge base snake_case data with decorator contributions (converted to snake_case)
  return {
    ...data,
    // Override with properly serialized decorator contributions:
    ...(enriched.application ? { application: enriched.application } : {}),
    ...(enriched.date !== undefined ? { date: enriched.date } : {}),
    ...(enriched.source !== undefined ? { source: enriched.source } : {}),
    ...(enriched.session
      ? {
          session: {
            id: (enriched.session as any).id,
            type: (enriched.session as any).sessionReplay != null ? resolveSessionType(enriched.session as any) : 'user',
            has_replay: resolveHasReplay((enriched.session as any).sessionReplay),
          },
        }
      : {}),
    ...(enriched.view
      ? {
          view: {
            id: (enriched.view as any).id,
            name: (enriched.view as any).name,
            url: (enriched.view as any).url,
            referrer: (enriched.view as any).referrer,
          },
        }
      : {}),
    ...(enriched.connectivity
      ? {
          connectivity: {
            status: (enriched.connectivity as any).status,
            effective_type: (enriched.connectivity as any).effectiveType,
            interfaces: (enriched.connectivity as any).interfaces,
          },
        }
      : {}),
    ...(enriched.display ? { display: enriched.display } : {}),
    ...(enriched.usr ? { usr: enriched.usr } : {}),
    ...(enriched.account ? { account: enriched.account } : {}),
    ...(enriched.featureFlags ? { feature_flags: enriched.featureFlags } : {}),
    ...(enriched.pageStates ? { _dd: { ...((data as any)._dd ?? {}), page_states: enriched.pageStates } } : {}),
    ...(enriched.inForeground != null
      ? { view: { ...((enriched.view ?? {}) as object), in_foreground: enriched.inForeground } }
      : {}),
    ...(enriched.dd ? { _dd: { ...((data as any)._dd ?? {}), ...(enriched.dd as object) } } : {}),
    ...(enriched._dd
      ? {
          _dd: {
            format_version: (enriched._dd as any).formatVersion,
            drift: (enriched._dd as any).drift,
            configuration: serializeConfiguration(enriched._dd as any),
            browser_sdk_version: (enriched._dd as any).browserSdkVersion,
            sdk_name: (enriched._dd as any).sdkName,
          },
        }
      : {}),
  } as unknown as AssembledRumEvent
}

function resolveSessionType(_session: { sessionReplay: SessionReplayState }): string {
  // Synthetics/CI contexts override session type — handled by those decorators
  // Default: 'user'
  return 'user'
}

function resolveHasReplay(sessionReplay: SessionReplayState): boolean | undefined {
  if (sessionReplay === undefined || sessionReplay === null) return undefined
  // SessionReplayState.OFF = 0, SAMPLED = 1, FORCED = 2
  return sessionReplay !== 0
}

function serializeConfiguration(dd: Record<string, unknown>): Record<string, unknown> {
  const config = dd.configuration as Record<string, unknown> | undefined
  if (!config) return {}
  return {
    session_sample_rate: config.sessionSampleRate,
    session_replay_sample_rate: config.sessionReplaySampleRate,
    profiling_sample_rate: config.profilingSampleRate,
    trace_sample_rate: config.traceSampleRate,
    beta_encode_cookie_options: config.betaEncodeCookieOptions,
  }
}
