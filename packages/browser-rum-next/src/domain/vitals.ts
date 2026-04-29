import type { Pipeline } from '@datadog/core-next'

interface StartVitalAction {
  name: string
  vitalKey?: string
  context?: object
}

interface StopVitalAction {
  name?: string
  vitalKey?: string
  context?: object
}

interface AddVitalAction {
  name: string
  value: number
  context?: object
}

function startVitalProcessor(pipeline: Pipeline<Record<string, unknown>>): void {
  const trackedVitals = new Map<string, { startTime: number; startDate: number; context?: object }>()

  pipeline.subscribe('action:start_vital', (data) => {
    const action = data as StartVitalAction
    const key = action.vitalKey ?? action.name
    trackedVitals.set(key, {
      startTime: performance.now(),
      startDate: Date.now(),
      context: action.context,
    })
  })

  pipeline.subscribe('action:stop_vital', (data) => {
    const action = data as StopVitalAction
    const key = action.vitalKey ?? action.name ?? ''
    const tracked = trackedVitals.get(key)
    if (!tracked) return
    trackedVitals.delete(key)

    const duration = performance.now() - tracked.startTime
    const mergedContext = action.context || tracked.context
      ? { ...(tracked.context ?? {}), ...(action.context ?? {}) }
      : undefined

    const observation: Record<string, unknown> = {
      type: 'vital',
      date: tracked.startDate,
      vital: {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `vital-${Date.now()}`,
        name: key,
        type: 'duration',
        value: duration,
      },
    }
    if (mergedContext && Object.keys(mergedContext).length > 0) {
      observation.context = mergedContext
    }

    pipeline.publish('observation:vital', observation)
  })

  pipeline.subscribe('action:add_vital', (data) => {
    const action = data as AddVitalAction

    const observation: Record<string, unknown> = {
      type: 'vital',
      date: Date.now(),
      vital: {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `vital-${Date.now()}`,
        name: action.name,
        type: 'duration',
        value: action.value,
      },
    }
    if (action.context) {
      observation.context = action.context
    }

    pipeline.publish('observation:vital', observation)
  })
}

export { startVitalProcessor }
export type { StartVitalAction, StopVitalAction, AddVitalAction }
