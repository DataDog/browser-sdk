import type { Pipeline } from '@datadog/core-next'

interface StartResourceAction {
  name: string
  resourceKey?: string
  context?: object
}

interface StopResourceAction {
  name?: string
  resourceKey?: string
  context?: object
}

function startManualResourceProcessor(pipeline: Pipeline<Record<string, unknown>>): void {
  const trackedResources = new Map<string, { startTime: number; startDate: number; context?: object }>()

  pipeline.subscribe('action:start_resource', (data) => {
    const action = data as StartResourceAction
    const key = action.resourceKey ?? action.name
    trackedResources.set(key, {
      startTime: performance.now(),
      startDate: Date.now(),
      context: action.context,
    })
  })

  pipeline.subscribe('action:stop_resource', (data) => {
    const action = data as StopResourceAction
    const key = action.resourceKey ?? action.name ?? ''
    const tracked = trackedResources.get(key)
    if (!tracked) return
    trackedResources.delete(key)

    const duration = performance.now() - tracked.startTime
    const mergedContext =
      action.context || tracked.context
        ? { ...(tracked.context ?? {}), ...(action.context ?? {}) }
        : undefined

    const observation: Record<string, unknown> = {
      type: 'resource',
      date: tracked.startDate,
      resource: {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `resource-${Date.now()}`,
        name: key,
        type: 'custom',
        duration,
      },
    }
    if (mergedContext && Object.keys(mergedContext).length > 0) {
      observation.context = mergedContext
    }

    pipeline.publish('observation:resource', observation)
  })
}

export { startManualResourceProcessor }
export type { StartResourceAction, StopResourceAction }
