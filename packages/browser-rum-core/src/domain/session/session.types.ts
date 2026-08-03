import type { ClocksState } from '@datadog/js-core/time'

export interface SessionExpiredEvent {
  endClocks: ClocksState
}
