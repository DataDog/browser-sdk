import { RumEvent } from '@datadog/browser-rum-core'

export interface CollectedRumEvent {
  source: 'main-process' | 'renderer'
  event: RumEvent
}
