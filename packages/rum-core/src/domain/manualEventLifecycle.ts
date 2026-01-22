import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export interface ManualEventLifecycle<TStartData> {
  start: (key: string, data: TStartData) => void
  get: (key: string) => TStartData | undefined
  remove: (key: string) => TStartData | undefined
  stopAll: () => void
}

export function createManualEventLifecycle<TStartData>(
  lifeCycle: LifeCycle,
  onDiscard?: (data: TStartData) => void
): ManualEventLifecycle<TStartData> {
  const activeEvents = new Map<string, TStartData>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    activeEvents.forEach((data) => onDiscard?.(data))
    activeEvents.clear()
  })

  return {
    start: (key: string, data: TStartData) => {
      const existing = activeEvents.get(key)
      if (existing) {
        onDiscard?.(existing)
      }
      activeEvents.set(key, data)
    },
    get: (key: string) => activeEvents.get(key),
    remove: (key: string) => {
      const data = activeEvents.get(key)
      if (data) {
        activeEvents.delete(key)
      }
      return data
    },
    stopAll: () => {
      activeEvents.forEach((data) => onDiscard?.(data))
      activeEvents.clear()
    },
  }
}
