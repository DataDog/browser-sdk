import { registerBridge } from '@datadog/core-next'
import type { Pipeline } from '@datadog/core-next'

let pipeline: Pipeline<Record<string, unknown>> | undefined
const pending: Array<{ type: string; data: unknown }> = []

function publish(type: string, data: unknown): void {
  if (pipeline) {
    pipeline.publish(type, data)
  } else {
    pending.push({ type, data })
  }
}

const datadogReplay = {
  startSessionReplayRecording(options?: { force?: boolean }) {
    publish('action:start_recording', { force: options?.force })
  },
  stopSessionReplayRecording() {
    publish('action:stop_recording', {})
  },
}

registerBridge('replay', {
  connect(p: Pipeline<Record<string, unknown>>) {
    pipeline = p
    for (const event of pending) {
      pipeline.publish(event.type, event.data)
    }
    pending.length = 0
  },
})

export { datadogReplay }

// Re-export types for consumers
export type { ReplayPublicApi } from './processor'
export type { ReplayInitConfiguration, ReplayConfig } from './domain/configuration'
