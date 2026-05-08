import type { Extension } from '@datadog/core-next'

interface ReplayInitConfiguration {
  sampleRate?: number
  startRecordingManually?: boolean
  defaultPrivacyLevel?: 'mask' | 'mask-user-input' | 'allow'
}

interface ReplayConfig {
  sampleRate: number
  startRecordingManually: boolean
  defaultPrivacyLevel: 'mask' | 'mask-user-input' | 'allow'
}

const replayExtension: Extension<'replay', ReplayInitConfiguration, ReplayConfig> = {
  key: 'replay',
  validate(init: ReplayInitConfiguration | undefined): ReplayConfig | null {
    if (!init) return null

    const sampleRate = init.sampleRate ?? 0
    if (typeof sampleRate !== 'number' || sampleRate < 0 || sampleRate > 100) {
      return null
    }

    const defaultPrivacyLevel = init.defaultPrivacyLevel ?? 'mask'
    if (!['mask', 'mask-user-input', 'allow'].includes(defaultPrivacyLevel)) {
      return null
    }

    return {
      sampleRate,
      startRecordingManually: init.startRecordingManually ?? false,
      defaultPrivacyLevel,
    }
  },
}

export { replayExtension }
export type { ReplayInitConfiguration, ReplayConfig }
