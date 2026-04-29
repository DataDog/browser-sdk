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

const datadogRum = {
  startView(name?: string) {
    publish('action:start_view', {
      url: window.location.href,
      startTime: performance.now(),
      startDate: Date.now(),
      referrer: '',
      loadingType: 'route_change',
      name,
    })
  },
  addError(error: Error | string, context?: object) {
    const errorObj = typeof error === 'string' ? new Error(error) : error
    publish('action:add_error', { error: errorObj, context })
  },
  addAction(name: string, context?: object) {
    publish('action:add_action', { name, context })
  },
  startAction(name: string, options?: { actionKey?: string; context?: object }) {
    publish('action:start_action', { name, ...options })
  },
  stopAction(name?: string, options?: { actionKey?: string; context?: object }) {
    publish('action:stop_action', { name, ...options })
  },
  startDurationVital(name: string, options?: { vitalKey?: string; context?: object }) {
    publish('action:start_vital', { name, ...options })
  },
  stopDurationVital(name?: string, options?: { vitalKey?: string; context?: object }) {
    publish('action:stop_vital', { name, ...options })
  },
  addDurationVital(name: string, value: number, options?: { context?: object }) {
    publish('action:add_vital', { name, value, ...options })
  },
  startResource(name: string, options?: { resourceKey?: string; context?: object }) {
    publish('action:start_resource', { name, ...options })
  },
  stopResource(name?: string, options?: { resourceKey?: string; context?: object }) {
    publish('action:stop_resource', { name, ...options })
  },
}

registerBridge('rum', {
  connect(p: Pipeline<Record<string, unknown>>) {
    pipeline = p
    for (const event of pending) {
      pipeline.publish(event.type, event.data)
    }
    pending.length = 0
  },
})

export { datadogRum }

// Re-export types for consumers
export type { RumPublicApi } from './processor'
export type { RumInitConfiguration, RumConfig } from './domain/configuration'
