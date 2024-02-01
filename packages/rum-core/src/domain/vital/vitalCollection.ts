import type { ClocksState } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'

export interface DurationVitalStart {
  name: string
  startClocks: ClocksState
}

export interface DurationVitalStop {
  name: string
  stopClocks: ClocksState
}

export function startVitalCollection(lifecycle: LifeCycle) {
  return {
    startDurationVital: (vitalStart: DurationVitalStart) => {},
    stopDurationVital: (vitalStop: DurationVitalStop) => {},
  }
}
