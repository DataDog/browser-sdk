import { clocksNow, generateUUID } from '@datadog/browser-core'
import type { StartRumResult } from '../..'
import type { WeightAverageMetric } from './metric'
import { createTimer } from './timer'

export interface API {
  addEvent: AddEvent
}

export type AddEvent = StartRumResult['addEvent']

interface Meta {
  duration?: number
  format?: string
  resolution?: string
}

interface Metrics {
  bitrate: WeightAverageMetric
  fps: WeightAverageMetric
  timestamp: number
  watchTime: number
}

type Transition = 'end' | 'error' | 'pause' | 'play' | 'preload' | 'quit' | 'rebuff' | 'seek' | 'start'

export function createStream(api: API) {
  const id = generateUUID()
  const origin = clocksNow()
  const timer = createTimer()

  return {
    interaction(id: string): void {},
    transition(state: Transition, context: any): void {
      if (state === 'play') {
        timer.start()
      }

      if (state === 'pause' || state === 'end') {
        timer.stop()
      }

      const now = clocksNow()

      api.addEvent(
        now.relative,
        {
          date: now.timeStamp,
          type: 'action',
          action: { id: generateUUID(), type: 'custom', target: { name: state } },
          stream: { id },
        },
        context
      )
    },
    update(key: string, value: any): void {
      const now = clocksNow()

      api.addEvent(
        now.relative,
        {
          date: now.timeStamp,
          type: 'stream',
          stream: {
            id: generateUUID(),
          },
        },
        {}
      )
    },
  }
}
