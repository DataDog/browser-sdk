import { clocksNow, generateUUID } from '@datadog/browser-core'
import type { StartRumResult } from '../..'
import { createLastMetric, createWeightAverageMetric } from './metric'
import { createTimer } from './timer'

export interface API {
  addEvent: AddEvent
}

interface Meta {
  duration?: number
  format?: string
  resolution?: string
}

export type AddEvent = StartRumResult['addEvent']

type Transition = 'end' | 'error' | 'pause' | 'play' | 'preload' | 'quit' | 'rebuff' | 'seek' | 'start'

export function createStream(api: API) {
  const id = generateUUID()
  const origin = clocksNow()
  const timer = createTimer()
  const meta: Meta = {}
  const metrics = {
    bitrate: createWeightAverageMetric(),
    fps: createWeightAverageMetric(),
    timestamp: createLastMetric(),
    watchTime: createLastMetric(),
  }

  function sendStreamEvent() {
    const now = clocksNow()

    api.addEvent(
      now.relative,
      {
        date: now.timeStamp,
        type: 'stream',
        stream: {
          id,
          bitrate: metrics.bitrate.value,
          duration: meta.duration,
          format: meta.format,
          fps: metrics.fps.value,
          resolution: meta.resolution,
          timestamp: metrics.timestamp.value,
          watch_time: metrics.watchTime.value,
        },
      },
      {}
    )
  }

  return {
    interaction(id: string): void {
      console.log('>>>', 'interaction', id)
    },
    set<K extends keyof Meta>(key: K, value: Meta[K]): void {
      if (meta[key] !== undefined) {
        return
      }

      meta[key] = value

      sendStreamEvent()
    },
    transition(state: Transition): void {
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
        {}
      )
    },
    update(key: keyof typeof metrics, value: number): void {
      metrics[key].update(timer.value, value)

      sendStreamEvent()
    },
  }
}
