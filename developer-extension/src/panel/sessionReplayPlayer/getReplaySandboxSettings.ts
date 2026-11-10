import type { Settings } from '../../common/extension.types'

/** The settings that customize the replay sandbox. */
export type ReplaySandboxSettings = Pick<
  Settings,
  'replaySandboxSource' | 'replaySandboxHash' | 'replaySandboxFeatureFlags'
>

// Reused at each call: the Replay tab restarts the player whenever the flags array changes.
const DEFAULT_REPLAY_SANDBOX_SETTINGS: Readonly<ReplaySandboxSettings> = {
  replaySandboxSource: 'prod',
  replaySandboxHash: '',
  replaySandboxFeatureFlags: [],
}

/** Gets the replay sandbox settings in effect. Only Datadog employee mode can customize them. */
export function getReplaySandboxSettings({
  datadogMode,
  replaySandboxSource,
  replaySandboxHash,
  replaySandboxFeatureFlags,
}: Pick<Settings, 'datadogMode'> & ReplaySandboxSettings): ReplaySandboxSettings {
  if (!datadogMode) {
    return DEFAULT_REPLAY_SANDBOX_SETTINGS
  }
  return { replaySandboxSource, replaySandboxHash, replaySandboxFeatureFlags }
}
