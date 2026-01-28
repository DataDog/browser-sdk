import type { ClocksState, Duration } from '@datadog/browser-core'
import { combine, elapsed } from '@datadog/browser-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export interface ManualEventRegistry<TData> {
  add: (key: string, startClocks: ClocksState, data: TData) => void
  remove: (
    key: string,
    stopClocks: ClocksState,
    data: Partial<TData>
  ) => (TData & { duration: Duration; startClocks: ClocksState }) | undefined
  stopAll: () => void
}

export function createManualEventLifecycle<TData>(
  lifeCycle: LifeCycle,
  onDiscard?: (data: TData) => void
): ManualEventRegistry<TData> {
  const activeEvents = new Map<string, { clocks: ClocksState; data: TData }>()

  function stopAll() {
    activeEvents.forEach((event) => onDiscard?.(event.data))
    activeEvents.clear()
  }

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, stopAll)

  return {
    add: (key, clocks, data) => {
      const existing = activeEvents.get(key)
      if (existing) {
        onDiscard?.(existing.data)
      }
      activeEvents.set(key, { clocks, data })
    },
    remove: (key, stopClocks, stopData) => {
      const startData = activeEvents.get(key)
      if (!startData) {
        return
      }

      activeEvents.delete(key)
      return {
        startClocks: startData.clocks,
        duration: elapsed(startData.clocks.relative, stopClocks.relative),
        ...(combine(startData.data, stopData) as TData),
      }
    },
    stopAll,
  }
}
